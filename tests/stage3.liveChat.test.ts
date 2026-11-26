// ============================================================================
// GRIOT AI — STAGE 3 LIVE CHAT EXPERIENCE TEST SUITE
// Covers all 15 Stage 3 requirements with mocked upstream providers (zero real
// Gemini calls):
//  1. Streaming response delivery & safe Markdown/code rendering
//  2. Completed response persistence & usage metadata
//  3. Interrupted stream handling (partial output preserved without corruption)
//  4. Stop/cancellation behaviour & server/provider abort propagation
//  5. Duplicate submission prevention
//  6. Conversation history loading & sensible auto-generated titles
//  7. Reopening an existing conversation & refresh restoration
//  8. Conversation rename
//  9. Conversation deletion
// 10. Cross-account conversation isolation (list, read, rename, delete, send)
// 11. Model/provider metadata accuracy & safe model selection
// 12. Fallback visibility (selected vs executed model)
// 13. Quota (429), rate-limit (429), and unavailable (503) error handling
// 14. Network failure recovery
// 15. Expired authentication during chat
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import vm from 'node:vm';
import {
  GriotCore,
  GriotHttpServer,
  renderGriotWebInterfaceHtml,
  type FetchFunction,
} from '../src/index.ts';

type MockScenario =
  | 'normal_stream'
  | 'slow_abortable_stream'
  | 'mid_stream_drop'
  | 'fallback_after_quota'
  | 'all_quota_429'
  | 'all_rate_limit_429'
  | 'all_unavailable_503';

interface MockEl {
  id?: string;
  type?: string;
  textContent: string;
  innerHTML: string;
  value: string;
  disabled: boolean;
  className: string;
  scrollTop: number;
  scrollHeight: number;
  style: Record<string, string>;
  children: MockEl[];
  onclick?: (ev?: unknown) => void;
  onkeydown?: (ev?: unknown) => void;
  classList: {
    add: (c: string) => void;
    remove: (c: string) => void;
    toggle: (c: string) => void;
    contains: (c: string) => boolean;
  };
  appendChild: (child: MockEl) => void;
  focus: () => void;
}

function createStage3VmClient(params: {
  apiBaseUrl: string;
  customFetch?: typeof globalThis.fetch;
  sharedSessionStore?: Map<string, string>;
}) {
  const html = renderGriotWebInterfaceHtml();
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Expected inline <script> in griotAppHtml.ts');
  const scriptSource = scriptMatch[1];

  const localStore = new Map<string, string>();
  const sessionStore = params.sharedSessionStore ?? new Map<string, string>();

  const makeEl = (): MockEl => {
    const classes = new Set<string>();
    const el: MockEl = {
      textContent: '',
      innerHTML: '',
      value: '',
      disabled: false,
      className: '',
      scrollTop: 0,
      scrollHeight: 100,
      style: {},
      children: [],
      classList: {
        add: (c: string) => {
          classes.add(c);
          el.className = Array.from(classes).join(' ');
        },
        remove: (c: string) => {
          classes.delete(c);
          el.className = Array.from(classes).join(' ');
        },
        toggle: (c: string) => {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
          el.className = Array.from(classes).join(' ');
        },
        contains: (c: string) => classes.has(c),
      },
      appendChild: (child: MockEl) => {
        el.children.push(child);
      },
      focus: () => {},
    };
    return el;
  };

  const elements: Record<string, MockEl> = {};
  const getEl = (id: string) => {
    if (!elements[id]) elements[id] = makeEl();
    return elements[id];
  };
  getEl('ask-module').value = 'griot_chat';

  const fetchLog: string[] = [];
  const wrappedFetch: typeof globalThis.fetch = async (input, init) => {
    fetchLog.push(`${(init?.method || 'GET').toUpperCase()} ${String(input)}`);
    if (params.customFetch) {
      return params.customFetch(input, init);
    }
    return globalThis.fetch(input, init);
  };

  const sandbox: Record<string, unknown> = {
    window: {
      location: { protocol: 'http:' },
      GRIOT_API_BASE_URL: params.apiBaseUrl,
    },
    fetch: wrappedFetch,
    AbortController,
    TextDecoder,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    atob: (b64: string) => Buffer.from(b64, 'base64').toString('binary'),
    Date,
    Math,
    Object,
    Array,
    String,
    Boolean,
    Number,
    Promise,
    JSON,
    RegExp,
    localStorage: {
      getItem: (k: string) => localStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        localStore.set(k, String(v));
      },
      removeItem: (k: string) => {
        localStore.delete(k);
      },
    },
    sessionStorage: {
      getItem: (k: string) => sessionStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        sessionStore.set(k, String(v));
      },
      removeItem: (k: string) => {
        sessionStore.delete(k);
      },
    },
    document: {
      getElementById: getEl,
      querySelectorAll: () => [],
      createElement: () => makeEl(),
    },
  };

  const testableScript =
    scriptSource.replace(/initializeApp\(\);\s*$/, '') +
    `\nglobalThis.__exports = {
      initializeApp, submitRegister, submitLogin, continueAsGuest, signOutUser,
      switchMode, griotFetch, getActiveSession, getStoredSessionToken,
      loadConversationsSidebar, loadConversationHistory, startNewConversation,
      renameConversation, deleteConversation, loadAvailableModels,
      sendAskGriot, stopAskGriot, renderSafeMarkdown, formatChatError,
      getActiveConversationId: () => activeConversationId,
      isCurrentlyGenerating: () => isGenerating,
      getCachedConversations: () => cachedConversations,
      getAvailableModels: () => availableModels
    };`;

  vm.createContext(sandbox);
  vm.runInContext(testableScript, sandbox);

  return {
    exports: sandbox.__exports as {
      initializeApp: () => Promise<void>;
      submitRegister: (ev?: unknown) => Promise<{ ok: boolean; status?: number }>;
      submitLogin: (ev?: unknown) => Promise<{ ok: boolean; status?: number }>;
      continueAsGuest: () => Promise<{ ok: boolean; status?: number }>;
      signOutUser: () => void;
      switchMode: (mode: string) => Promise<void>;
      griotFetch: (ep: string, opts?: Record<string, unknown>) => Promise<{
        ok: boolean;
        status: number;
        data: unknown;
        error: { code: string; message: string } | null;
      }>;
      getActiveSession: () => {
        token: string;
        mode: string;
        user: { id: string; displayName: string; email: string | null };
        org: { id: string | null; name: string };
      } | null;
      getStoredSessionToken: () => string | null;
      loadConversationsSidebar: (opts?: Record<string, unknown>) => Promise<Array<{ id: string; title: string }>>;
      loadConversationHistory: (convId: string) => Promise<{ ok: boolean; data?: { messages: Array<{ role: string; content: string; status: string; provider: string | null; modelId: string | null; metadata: Record<string, unknown> }> } }>;
      startNewConversation: () => void;
      renameConversation: (convId: string, newTitle: string) => Promise<{ ok: boolean; data?: { title: string } }>;
      deleteConversation: (convId: string) => Promise<{ ok: boolean; data?: { deleted: boolean } }>;
      loadAvailableModels: () => Promise<Array<{ id: string; provider: string; displayName: string }>>;
      sendAskGriot: (overridePrompt?: string) => Promise<{
        ok: boolean;
        status?: number;
        conversationId?: string | null;
        content?: string;
        interrupted?: boolean;
        meta?: Record<string, unknown>;
        error?: { code: string; message: string };
      }>;
      stopAskGriot: () => boolean;
      renderSafeMarkdown: (text: string) => string;
      formatChatError: (err: Record<string, unknown>, status?: number) => {
        title: string;
        message: string;
        retryable: boolean;
        requiresAuth: boolean;
      };
      getActiveConversationId: () => string | null;
      isCurrentlyGenerating: () => boolean;
      getCachedConversations: () => Array<{ id: string; title: string }>;
      getAvailableModels: () => Array<{ id: string; provider: string; displayName: string }>;
    },
    getEl,
    sessionStore,
    fetchLog,
  };
}

describe('GRIOT AI — Stage 3 Live Chat Experience Suite', () => {
  let tmpDir: string;
  let core: GriotCore;
  let httpServer: GriotHttpServer;
  let apiBaseUrl: string;
  let scenario: MockScenario = 'normal_stream';
  let upstreamAbortObserved = false;
  let upstreamAttemptedUrls: string[] = [];

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'griot-stage3-chat-'));

    const mockUpstreamFetch: FetchFunction = async (input, init) => {
      const url = String(input);
      upstreamAttemptedUrls.push(url);
      const encoder = new TextEncoder();

      if (scenario === 'all_quota_429') {
        return new Response(
          JSON.stringify({ error: { message: 'Resource has been exhausted (quota exceeded).' } }),
          { status: 429 }
        );
      }

      if (scenario === 'all_rate_limit_429') {
        return new Response(
          JSON.stringify({ error: { message: 'Too many requests, rate limit reached.' } }),
          { status: 429 }
        );
      }

      if (scenario === 'all_unavailable_503') {
        return new Response(
          JSON.stringify({ error: { message: 'The model is currently overloaded.' } }),
          { status: 503 }
        );
      }

      if (scenario === 'fallback_after_quota') {
        // Primary free-tier Gemini model returns 429 quota exceeded; fallback model succeeds
        if (url.includes('gemini-3.5-flash-lite')) {
          return new Response(
            JSON.stringify({ error: { message: 'Quota exceeded for gemini-3.5-flash-lite.' } }),
            { status: 429 }
          );
        }
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  candidates: [{ content: { parts: [{ text: 'Handled cleanly by fallback model.' }] } }],
                  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
                })}\n\n`
              )
            );
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }

      if (scenario === 'slow_abortable_stream') {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            upstreamAbortObserved = true;
          });
        }
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  candidates: [{ content: { parts: [{ text: 'Part 1 of slow response. ' }] } }],
                })}\n\n`
              )
            );
            for (let i = 2; i <= 12; i++) {
              await new Promise((r) => setTimeout(r, 40));
              if (signal?.aborted) {
                upstreamAbortObserved = true;
                try {
                  controller.close();
                } catch {
                  // ignore
                }
                return;
              }
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    candidates: [{ content: { parts: [{ text: `Chunk ${i}. ` }] } }],
                  })}\n\n`
                )
              );
            }
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }

      if (scenario === 'mid_stream_drop') {
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  candidates: [{ content: { parts: [{ text: 'Partial answer before drop' }] } }],
                })}\n\n`
              )
            );
            await new Promise((r) => setTimeout(r, 15));
            controller.error(new Error('Upstream socket reset'));
          },
        });
        return new Response(stream, { status: 200 });
      }

      // Default: normal_stream with Markdown + fenced code block + XSS test string
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const chunks = [
            '## Summary\n\nHere is a **bold** tip and ',
            'safe text <script>alert(1)</script>.\n\n',
            '```ts\nconst greet = (name: string) => `Hello ${name}`;\n```\n',
          ];
          for (const text of chunks) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  candidates: [{ content: { parts: [{ text }] } }],
                })}\n\n`
              )
            );
            await new Promise((r) => setTimeout(r, 8));
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                candidates: [{ content: { parts: [{ text: '' }] } }],
                usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 32 },
              })}\n\n`
            )
          );
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    };

    core = new GriotCore({
      config: {
        env: 'test',
        sqlitePath: ':memory:',
        privateStorageDir: path.join(tmpDir, 'vault'),
        allowMockProvidersWhenUnconfigured: false,
        providers: {
          gemini: {
            apiKey: 'mock-stage3-gemini-key',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          },
          openai: { apiKey: null, baseUrl: 'https://api.openai.com/v1' },
          anthropic: { apiKey: null, baseUrl: 'https://api.anthropic.com/v1' },
          mistral: { apiKey: null, baseUrl: 'https://api.mistral.ai/v1' },
          open_weight: { apiKey: null, baseUrl: 'http://127.0.0.1:11434/v1' },
        },
      },
      fetchFn: mockUpstreamFetch,
    });

    httpServer = new GriotHttpServer(core);
    const port = await httpServer.listen(0, '127.0.0.1');
    apiBaseUrl = `http://127.0.0.1:${port}/api/v1`;
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

  it('1–2 & 6–9 & 11. Streams responses with safe Markdown, persists history, restores on refresh, renames, deletes, and shows accurate model/provider metadata', async () => {
    scenario = 'normal_stream';
    core.providerManager.resetCircuit();
    const sharedSession = new Map<string, string>();
    const client = createStage3VmClient({ apiBaseUrl, sharedSessionStore: sharedSession });

    // Register User A
    client.getEl('register-name').value = 'Zainab Mensah';
    client.getEl('register-email').value = 'zainab@griot.africa';
    client.getEl('register-password').value = 'ZainabPass2026!';
    client.getEl('register-confirm-password').value = 'ZainabPass2026!';
    const regRes = await client.exports.submitRegister();
    assert.equal(regRes.ok, true);

    await client.exports.switchMode('ask');

    // 11. Model selector loads only configured/available models (Gemini only in this test config)
    const models = client.exports.getAvailableModels();
    assert.ok(models.length >= 2, 'Expected available Gemini chat models');
    assert.ok(
      models.every((m) => m.provider === 'gemini'),
      'Unconfigured providers must not appear as selectable models'
    );

    // 1. Streaming response delivery + Safe Markdown + XSS sanitization
    const sendRes = await client.exports.sendAskGriot(
      'Explain how to write a TypeScript greeting function'
    );
    assert.equal(sendRes.ok, true);
    assert.ok(sendRes.conversationId, 'Expected auto-created conversationId');
    assert.match(sendRes.content || '', /Summary/);
    assert.match(sendRes.content || '', /const greet/);

    // Verify rendered Markdown in assistant bubble escapes <script> and includes code copy button
    const chatBox = client.getEl('chat-messages');
    const lastBubble = chatBox.children[chatBox.children.length - 1];
    const bodyEl = lastBubble.children[1];
    const metaEl = lastBubble.children[2];
    assert.ok(bodyEl.innerHTML.includes('<h2>Summary</h2>'));
    assert.ok(bodyEl.innerHTML.includes('<strong>bold</strong>'));
    assert.ok(bodyEl.innerHTML.includes('code-copy-btn'));
    assert.equal(bodyEl.innerHTML.includes('<script>'), false, 'Raw <script> tag must be escaped');
    assert.ok(bodyEl.innerHTML.includes('&lt;script&gt;'));
    const executedModelId = String(sendRes.meta?.modelId || '');
    const executedModelName = String(sendRes.meta?.modelDisplayName || '');
    assert.ok(executedModelId.startsWith('gemini:'), 'Expected a Gemini model to execute');
    assert.ok(executedModelName.length > 0, 'Expected executed model display name');
    assert.ok(
      metaEl.textContent.includes(executedModelName),
      `Expected UI meta '${metaEl.textContent}' to include executed model '${executedModelName}'`
    );
    assert.match(metaEl.textContent, /Gemini/);

    // 2. Completed response persisted in DB with usage & model metadata
    const convId = sendRes.conversationId!;
    const histRes = await client.exports.loadConversationHistory(convId);
    assert.equal(histRes.ok, true);
    const msgs = histRes.data?.messages || [];
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, 'user');
    assert.equal(msgs[1].role, 'assistant');
    assert.equal(msgs[1].status, 'completed');
    assert.equal(msgs[1].provider, 'gemini');
    assert.equal(msgs[1].modelId, executedModelId);

    // 11b. Explicit safe model selection via #ask-model-select routes to the chosen model
    client.getEl('ask-model-select').value = 'gemini:gemini-3.5-flash-lite';
    const explicitRes = await client.exports.sendAskGriot('Quick follow-up question');
    assert.equal(explicitRes.ok, true);
    assert.equal(explicitRes.meta?.modelId, 'gemini:gemini-3.5-flash-lite');
    assert.equal(explicitRes.meta?.fallbackUsed, false);
    client.getEl('ask-model-select').value = '';

    // 6. Conversation list loaded with sensible title from first user message
    const convs = client.exports.getCachedConversations();
    assert.equal(convs.length, 1);
    assert.match(convs[0].title, /Explain how to write a TypeScript greeting/);

    // 7. Browser refresh restores session AND reopens the selected conversation automatically
    const refreshedClient = createStage3VmClient({
      apiBaseUrl,
      sharedSessionStore: sharedSession,
    });
    await refreshedClient.exports.initializeApp();
    assert.equal(refreshedClient.exports.getActiveConversationId(), convId);
    assert.ok(
      refreshedClient.getEl('chat-messages').children.length >= 2,
      'Expected persisted messages to reload after refresh'
    );

    // 8. Rename conversation
    const renameRes = await refreshedClient.exports.renameConversation(
      convId,
      'TypeScript Greeting Guide'
    );
    assert.equal(renameRes.ok, true);
    assert.equal(renameRes.data?.title, 'TypeScript Greeting Guide');
    assert.equal(refreshedClient.getEl('ask-chat-title').textContent, 'TypeScript Greeting Guide');

    // 9. Delete conversation
    const delRes = await refreshedClient.exports.deleteConversation(convId);
    assert.equal(delRes.ok, true);
    assert.equal(delRes.data?.deleted, true);
    assert.equal(refreshedClient.exports.getActiveConversationId(), null);
    assert.equal(refreshedClient.exports.getCachedConversations().length, 0);
  });

  it('3–5. Handles stop/cancellation with server-to-provider abort propagation, duplicate submission prevention, and mid-stream interruption', async () => {
    core.providerManager.resetCircuit();
    const client = createStage3VmClient({ apiBaseUrl });

    client.getEl('register-name').value = 'Tunde Adeyemi';
    client.getEl('register-email').value = 'tunde@griot.africa';
    client.getEl('register-password').value = 'TundePass2026!';
    client.getEl('register-confirm-password').value = 'TundePass2026!';
    assert.equal((await client.exports.submitRegister()).ok, true);
    await client.exports.switchMode('ask');

    // 4 & 5. Start a slow stream, attempt duplicate submission, then click Stop
    scenario = 'slow_abortable_stream';
    upstreamAbortObserved = false;

    const streamPromise = client.exports.sendAskGriot('Write a long essay about renewable energy');

    // Wait briefly so generation is active and at least first chunk arrives
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(client.exports.isCurrentlyGenerating(), true);
    assert.equal(client.getEl('ask-send-btn').disabled, true);
    assert.equal(client.getEl('ask-stop-btn').classList.contains('visible'), true);

    // 5. Duplicate submission must be blocked while generating
    const dupRes = await client.exports.sendAskGriot('Duplicate message');
    assert.equal(dupRes.ok, false);
    assert.equal(dupRes.error?.code, 'GENERATION_IN_PROGRESS');

    // 4. Stop generation
    const stopped = client.exports.stopAskGriot();
    assert.equal(stopped, true);

    const streamRes = await streamPromise;
    assert.equal(streamRes.interrupted, true);
    assert.equal(client.exports.isCurrentlyGenerating(), false);
    assert.equal(client.getEl('ask-send-btn').disabled, false);
    assert.equal(client.getEl('ask-stop-btn').classList.contains('visible'), false);

    // Give server close listener a tick to propagate abort to upstream mock fetch
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(
      upstreamAbortObserved,
      true,
      'Expected client Stop to propagate abort through GriotHttpServer to upstream provider fetch'
    );

    // Verify conversation history preserved user message and was not corrupted
    const convId = streamRes.conversationId!;
    assert.ok(convId);
    const histAfterStop = await client.exports.loadConversationHistory(convId);
    assert.equal(histAfterStop.ok, true);
    assert.equal(histAfterStop.data?.messages[0].role, 'user');
    assert.equal(
      histAfterStop.data?.messages[0].content,
      'Write a long essay about renewable energy'
    );

    // 3. Interrupted stream (mid-stream upstream socket drop) preserves partial output cleanly
    scenario = 'mid_stream_drop';
    const dropRes = await client.exports.sendAskGriot('Continue with solar power details');
    assert.equal(dropRes.interrupted, true);
    assert.match(dropRes.content || '', /Partial answer before drop/);

    const histAfterDrop = await client.exports.loadConversationHistory(convId);
    const lastMsg = histAfterDrop.data?.messages[histAfterDrop.data.messages.length - 1];
    assert.equal(lastMsg?.role, 'assistant');
    assert.equal(lastMsg?.status, 'interrupted');
    assert.match(lastMsg?.content || '', /Partial answer before drop/);
  });

  it('10. Enforces strict cross-account conversation isolation (list, read, rename, delete, send)', async () => {
    scenario = 'normal_stream';
    core.providerManager.resetCircuit();

    const clientA = createStage3VmClient({ apiBaseUrl });
    clientA.getEl('register-name').value = 'Account One';
    clientA.getEl('register-email').value = 'acct1@griot.africa';
    clientA.getEl('register-password').value = 'AccountOnePass1!';
    clientA.getEl('register-confirm-password').value = 'AccountOnePass1!';
    assert.equal((await clientA.exports.submitRegister()).ok, true);
    await clientA.exports.switchMode('ask');

    const chatA = await clientA.exports.sendAskGriot('Confidential Q4 financial roadmap');
    assert.equal(chatA.ok, true);
    const convAId = chatA.conversationId!;

    // Switch to Account B on a fresh client
    const clientB = createStage3VmClient({ apiBaseUrl });
    clientB.getEl('register-name').value = 'Account Two';
    clientB.getEl('register-email').value = 'acct2@griot.africa';
    clientB.getEl('register-password').value = 'AccountTwoPass2!';
    clientB.getEl('register-confirm-password').value = 'AccountTwoPass2!';
    assert.equal((await clientB.exports.submitRegister()).ok, true);
    await clientB.exports.switchMode('ask');

    assert.equal(clientB.exports.getCachedConversations().length, 0);

    const readA = await clientB.exports.griotFetch(`/conversations/${convAId}/messages`);
    assert.equal(readA.ok, false);
    assert.equal(readA.status, 403);
    assert.equal(readA.error?.code, 'TENANT_ISOLATION_DENIED');

    const renameA = await clientB.exports.renameConversation(convAId, 'Hijacked Title');
    assert.equal(renameA.ok, false);

    const deleteA = await clientB.exports.deleteConversation(convAId);
    assert.equal(deleteA.ok, false);

    const postMsgA = await clientB.exports.griotFetch(`/conversations/${convAId}/messages`, {
      method: 'POST',
      body: { prompt: 'Injected message', stream: false },
    });
    assert.equal(postMsgA.ok, false);
    assert.equal(postMsgA.status, 403);
  });

  it('12–15. Reflects fallback visibility, quota/rate-limit/503 errors, network failure recovery, and expired auth during chat', async () => {
    core.providerManager.resetCircuit();
    const client = createStage3VmClient({ apiBaseUrl });

    client.getEl('register-name').value = 'Nadia Diallo';
    client.getEl('register-email').value = 'nadia@griot.africa';
    client.getEl('register-password').value = 'NadiaPass2026!';
    client.getEl('register-confirm-password').value = 'NadiaPass2026!';
    assert.equal((await client.exports.submitRegister()).ok, true);
    await client.exports.switchMode('ask');

    // 12. Fallback visibility: primary gemini-3.5-flash-lite returns 429 quota -> falls back to gemini-3.8-flash
    scenario = 'fallback_after_quota';
    upstreamAttemptedUrls = [];
    const fbRes = await client.exports.sendAskGriot('Summarize West African fintech growth');
    assert.equal(fbRes.ok, true);
    assert.equal(fbRes.meta?.fallbackUsed, true);
    assert.equal(fbRes.meta?.selectedModelId, 'gemini:gemini-3.5-flash-lite');
    assert.equal(fbRes.meta?.modelId, 'gemini:gemini-3.8-flash');

    const chatBox = client.getEl('chat-messages');
    const fbBubble = chatBox.children[chatBox.children.length - 1];
    const fbMeta = fbBubble.children[2];
    assert.match(fbMeta.textContent, /Gemini 3\.8 Flash/);
    assert.match(fbMeta.textContent, /Fallback from Google Gemini 3\.5 Flash-Lite/);

    // 13a. Quota exhausted across all models -> clear user-friendly quota error
    core.providerManager.resetCircuit();
    scenario = 'all_quota_429';
    const quotaRes = await client.exports.sendAskGriot('Test quota error');
    assert.equal(quotaRes.ok, false);
    assert.equal(quotaRes.error?.code, 'PROVIDER_QUOTA_EXCEEDED');
    const quotaBubble = chatBox.children[chatBox.children.length - 1];
    assert.match(quotaBubble.children[1].innerHTML, /Model Quota Reached/);
    assert.equal(client.exports.isCurrentlyGenerating(), false);

    // 13b. Rate limit across all models -> clear rate-limit error
    core.providerManager.resetCircuit();
    scenario = 'all_rate_limit_429';
    const rlRes = await client.exports.sendAskGriot('Test rate limit error');
    assert.equal(rlRes.ok, false);
    assert.equal(rlRes.error?.code, 'PROVIDER_RATE_LIMIT');
    const rlBubble = chatBox.children[chatBox.children.length - 1];
    assert.match(rlBubble.children[1].innerHTML, /Rate Limit Reached/);

    // 13c. Provider unavailable (503) -> clear unavailable error
    core.providerManager.resetCircuit();
    scenario = 'all_unavailable_503';
    const unavailRes = await client.exports.sendAskGriot('Test 503 error');
    assert.equal(unavailRes.ok, false);
    assert.equal(unavailRes.error?.code, 'PROVIDER_PROVIDER_UNAVAILABLE');
    const unavailBubble = chatBox.children[chatBox.children.length - 1];
    assert.match(unavailBubble.children[1].innerHTML, /Provider Temporarily Unavailable/);

    // 14. Network failure recovery
    let failNetwork = true;
    const netClient = createStage3VmClient({
      apiBaseUrl,
      customFetch: async (input, init) => {
        if (failNetwork && String(input).includes('/chat/completions')) {
          throw new TypeError('Failed to fetch');
        }
        return globalThis.fetch(input, init);
      },
    });
    netClient.getEl('login-email').value = 'nadia@griot.africa';
    netClient.getEl('login-password').value = 'NadiaPass2026!';
    assert.equal((await netClient.exports.submitLogin()).ok, true);

    const netErrRes = await netClient.exports.sendAskGriot('Check network recovery');
    assert.equal(netErrRes.ok, false);
    assert.equal(netErrRes.error?.code, 'NETWORK_ERROR');
    assert.equal(netClient.exports.isCurrentlyGenerating(), false);

    // Retry succeeds once network recovers
    failNetwork = false;
    core.providerManager.resetCircuit();
    scenario = 'normal_stream';
    const recoveredRes = await netClient.exports.sendAskGriot('Check network recovery');
    assert.equal(recoveredRes.ok, true);

    // 15. Expired authentication during chat clears session & opens login modal without sending token
    const expiredHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const expiredPayload = Buffer.from(
      JSON.stringify({ sub: 'user_expired', orgId: 'org_expired', exp: Math.floor(Date.now() / 1000) - 120 })
    ).toString('base64url');
    const expiredJwt = `${expiredHeader}.${expiredPayload}.sig`;

    const expiredStore = new Map<string, string>([
      [
        'griot_auth_session_v2',
        JSON.stringify({
          token: expiredJwt,
          mode: 'authenticated',
          user: { id: 'user_expired', displayName: 'Nadia Diallo', email: 'nadia@griot.africa' },
          org: { id: 'org_expired', name: 'Nadia Org' },
        }),
      ],
    ]);
    const expiredClient = createStage3VmClient({
      apiBaseUrl,
      sharedSessionStore: expiredStore,
    });
    const callsBefore = expiredClient.fetchLog.length;
    const expiredChatRes = await expiredClient.exports.sendAskGriot('Message with expired JWT');
    assert.equal(expiredChatRes.ok, false);
    assert.equal(expiredChatRes.status, 401);
    assert.equal(expiredChatRes.error?.code, 'SESSION_EXPIRED');
    assert.equal(expiredClient.fetchLog.length, callsBefore, 'Expired JWT must not be sent');
    assert.equal(expiredClient.exports.getStoredSessionToken(), null);
    assert.equal(expiredClient.getEl('auth-modal-overlay').classList.contains('open'), true);
  });
});
