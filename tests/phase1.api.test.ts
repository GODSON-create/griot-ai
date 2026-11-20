// ============================================================================
// GRIOT AI — PHASE 1 END-TO-END VERSIONED REST & SSE API TEST SUITE (/api/v1/*)
// Exercises the running HTTP server across auth, tenancy, API keys, model
// registry, routing selection, persistent conversations, SSE streaming,
// private file upload/download, knowledge base RAG, usage, and observability.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { GriotCore, GriotHttpServer, type FetchFunction } from '../src/index.ts';

describe('GRIOT AI — Phase 1 Versioned HTTP & SSE API Integration Suite (/api/v1)', () => {
  let tmpDir: string;
  let core: GriotCore;
  let httpServer: GriotHttpServer;
  let baseUrl: string;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'griot-phase1-api-'));

    const mockUpstreamFetch: FetchFunction = async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.includes(':streamGenerateContent') || body?.stream === true) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            if (url.includes('generativelanguage.googleapis.com')) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    candidates: [{ content: { parts: [{ text: 'GRIOT ' }] } }],
                  })}\n\n`
                )
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    candidates: [{ content: { parts: [{ text: 'Live Stream!' }] } }],
                    usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 5 },
                  })}\n\n`
                )
              );
            } else {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    choices: [{ delta: { content: 'GRIOT Live Stream!' } }],
                  })}\n\n`
                )
              );
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            }
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }

      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'GRIOT Gemini unified response with RAG citations.' }],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 42,
              candidatesTokenCount: 18,
              cachedContentTokenCount: 0,
            },
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          id: 'cmpl_api_1',
          choices: [
            {
              message: {
                content: 'GRIOT unified provider response.',
              },
            },
          ],
          usage: { prompt_tokens: 30, completion_tokens: 14 },
        }),
        { status: 200 }
      );
    };

    core = new GriotCore({
      config: {
        env: 'test',
        sqlitePath: ':memory:',
        privateStorageDir: path.join(tmpDir, 'vault'),
        providers: {
          gemini: {
            apiKey: 'mock-gemini-key',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          },
          openai: {
            apiKey: 'mock-openai-key',
            baseUrl: 'https://api.openai.com/v1',
          },
          anthropic: {
            apiKey: 'mock-anthropic-key',
            baseUrl: 'https://api.anthropic.com/v1',
          },
          mistral: {
            apiKey: 'mock-mistral-key',
            baseUrl: 'https://api.mistral.ai/v1',
          },
          open_weight: {
            apiKey: null,
            baseUrl: 'http://127.0.0.1:8000/v1',
          },
        },
      },
      fetchFn: mockUpstreamFetch,
    });

    httpServer = new GriotHttpServer(core);
    const port = await httpServer.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await httpServer.close();
    core.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('End-to-End API Flow: Health -> Auth -> Org/API Key -> Models -> Files -> Knowledge RAG -> Conversations -> SSE Stream -> Usage -> Admin', async () => {
    // 1. Health Endpoint
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = (await healthRes.json()) as Record<string, unknown>;
    assert.equal(healthBody.success, true);
    assert.equal(healthBody.apiVersion, 'v1');

    // 2. Register User & Personal Organisation
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'kwame@avantage.group',
        displayName: 'Kwame Nkrumah',
        password: 'SuperSecurePassword2026!',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = (await regRes.json()) as {
      data: { accessToken: string; user: { id: string }; personalOrg: { id: string } };
    };
    const jwt = regJson.data.accessToken;
    assert.ok(jwt);

    // 3. Issue API Key
    const keyRes = await fetch(`${baseUrl}/api/v1/organisations/current/api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        name: 'Production Backend Key',
        rateLimitRpm: 100,
      }),
    });
    assert.equal(keyRes.status, 201);
    const keyJson = (await keyRes.json()) as { data: { rawKey: string; id: string } };
    const rawApiKey = keyJson.data.rawKey;
    assert.ok(rawApiKey.startsWith('griot_sk_'));

    // 4. List Models & Select Model via API Key
    const modelsRes = await fetch(`${baseUrl}/api/v1/models?onlyAvailable=true`, {
      headers: { 'X-Griot-Api-Key': rawApiKey },
    });
    assert.equal(modelsRes.status, 200);
    const modelsJson = (await modelsRes.json()) as {
      data: { models: Array<{ id: string }> };
    };
    assert.ok(modelsJson.data.models.length >= 10);

    const selectRes = await fetch(`${baseUrl}/api/v1/models/select`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Griot-Api-Key': rawApiKey,
      },
      body: JSON.stringify({
        prompt: 'Write a short simple email to welcome our new team member.',
      }),
    });
    assert.equal(selectRes.status, 200);
    const selectJson = (await selectRes.json()) as {
      data: { taskClassification: string; selectedModel: { id: string } };
    };
    assert.equal(selectJson.data.taskClassification, 'simple_writing');

    // 5. Upload Private File & Download via Signed Internal Token
    const fileRes = await fetch(`${baseUrl}/api/v1/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        originalName: 'avantage-q4-brief.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from(
          'Avantage Group Q4 revenue target is $12.5M across West and East Africa.',
          'utf8'
        ).toString('base64'),
      }),
    });
    assert.equal(fileRes.status, 201);
    const fileJson = (await fileRes.json()) as {
      data: {
        file: { id: string };
        signedAccess: { internalPath: string; token: string };
      };
    };

    const downloadRes = await fetch(
      `${baseUrl}${fileJson.data.signedAccess.internalPath}`,
      {
        headers: { Authorization: `Bearer ${jwt}` },
      }
    );
    assert.equal(downloadRes.status, 200);
    const downloadedText = await downloadRes.text();
    assert.match(downloadedText, /\$12\.5M/);

    // 6. Create Knowledge Base, Ingest Document & Retrieve
    const kbRes = await fetch(`${baseUrl}/api/v1/knowledge-bases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        name: 'Avantage Corporate Handbook',
        description: 'Official internal handbook',
      }),
    });
    assert.equal(kbRes.status, 201);
    const kbJson = (await kbRes.json()) as { data: { id: string } };
    const kbId = kbJson.data.id;

    const ingestRes = await fetch(
      `${baseUrl}/api/v1/knowledge-bases/${kbId}/documents`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          title: 'GRIOT Product Architecture Charter',
          sourceType: 'institutional_knowledge',
          sourceUri: 'avantage://charter/griot',
          content:
            'GRIOT AI powers six core pillars: GRIOT Chat, GRIOT Learn, GRIOT Business, GRIOT Develop, GRIOT API, and GRIOT Agents.',
          permissionVerified: true,
        }),
      }
    );
    assert.equal(ingestRes.status, 201);

    // 7. Create Conversation & Send Message with Knowledge Base RAG + File Attachment
    const convRes = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ title: 'GRIOT Architecture Review' }),
    });
    assert.equal(convRes.status, 201);
    const convJson = (await convRes.json()) as { data: { id: string } };
    const convId = convJson.data.id;

    const msgRes = await fetch(
      `${baseUrl}/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          prompt: 'What are the six core pillars of GRIOT AI?',
          knowledgeBaseIds: [kbId],
          attachmentFileIds: [fileJson.data.file.id],
        }),
      }
    );
    assert.equal(msgRes.status, 200);
    const msgJson = (await msgRes.json()) as {
      data: {
        content: string;
        knowledgeSources: Array<{ title: string }>;
        usageLedger: { billableCostUsd: number };
      };
    };
    assert.ok(msgJson.data.content.length > 0);
    assert.equal(
      msgJson.data.knowledgeSources[0].title,
      'GRIOT Product Architecture Charter'
    );

    // 8. Stream Chat Response over Server-Sent Events (SSE)
    const streamRes = await fetch(`${baseUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        conversationId: convId,
        prompt: 'Stream a short summary.',
        stream: true,
      }),
    });
    assert.equal(streamRes.status, 200);
    assert.match(streamRes.headers.get('content-type') || '', /text\/event-stream/);
    const sseBody = await streamRes.text();
    assert.match(sseBody, /event: routing/);
    assert.match(sseBody, /event: delta/);
    assert.match(sseBody, /event: completed/);
    assert.match(sseBody, /GRIOT Live Stream!/);

    // 9. Usage & Admin Observability Endpoints
    const usageRes = await fetch(`${baseUrl}/api/v1/usage`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    assert.equal(usageRes.status, 200);
    const usageJson = (await usageRes.json()) as {
      data: { totalRequests: number; totalInputTokens: number };
    };
    assert.ok(usageJson.data.totalRequests >= 2);

    const obsRes = await fetch(`${baseUrl}/api/v1/admin/observability`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    assert.equal(obsRes.status, 200);
    const obsJson = (await obsRes.json()) as {
      data: {
        trafficAndTokens: { totalRequests: number };
        recentConversationsMetadata: Array<{ contentPreview: string }>;
      };
    };
    assert.ok(obsJson.data.trafficAndTokens.totalRequests >= 2);
    assert.equal(
      obsJson.data.recentConversationsMetadata[0].contentPreview,
      '[REDACTED_PRIVATE_USER_CONVERSATION]'
    );
  });
});
