// ============================================================================
// GRIOT AI — GOOGLE GEMINI OFFICIAL API ADAPTER
// Supports /v1beta/models/{model}:generateContent & :streamGenerateContent?alt=sse
// ============================================================================

import type {
  ChatMessageInput,
  ProviderGenerationRequest,
  ProviderGenerationResponse,
  ProviderStreamChunk,
} from '../types/domain.ts';
import {
  classifyHttpError,
  estimateTokenCount,
  parseSseDataFrames,
  ProviderError,
  type FetchFunction,
  type ModelProviderAdapter,
  type ProviderCredentials,
} from './adapter.ts';

export class GeminiProviderAdapter implements ModelProviderAdapter {
  public readonly providerName = 'gemini' as const;
  private readonly fetchFn: FetchFunction;

  constructor(fetchFn: FetchFunction = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private ensureKey(credentials: ProviderCredentials): string {
    if (!credentials.apiKey || !credentials.apiKey.trim()) {
      throw new ProviderError({
        provider: 'gemini',
        category: 'auth_error',
        statusCode: 401,
        retryable: false,
        message: 'Google Gemini API key is not configured.',
      });
    }
    return credentials.apiKey.trim();
  }

  private buildGeminiBody(request: ProviderGenerationRequest): Record<string, unknown> {
    const systemMsgs = request.messages.filter((m) => m.role === 'system');
    const chatMsgs = request.messages.filter((m) => m.role !== 'system');

    const contents = chatMsgs.map((msg: ChatMessageInput) => {
      const parts: Array<Record<string, unknown>> = [{ text: msg.content }];
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.inlineBase64) {
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: att.inlineBase64,
              },
            });
          } else if (att.extractedText) {
            parts.push({
              text: `[Attachment ${att.originalName}]:\n${att.extractedText}`,
            });
          }
        }
      }
      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    const body: Record<string, unknown> = {
      contents:
        contents.length > 0
          ? contents
          : [{ role: 'user', parts: [{ text: systemMsgs.map((s) => s.content).join('\n') }] }],
    };

    if (systemMsgs.length > 0) {
      body.systemInstruction = {
        parts: [{ text: systemMsgs.map((s) => s.content).join('\n\n') }],
      };
    }

    const generationConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }
    if (request.maxOutputTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxOutputTokens;
    }
    if (request.responseFormat === 'json_object') {
      generationConfig.responseMimeType = 'application/json';
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parametersSchema,
          })),
        },
      ];
    }

    return body;
  }

  public async generate(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): Promise<ProviderGenerationResponse> {
    const apiKey = this.ensureKey(credentials);
    const startMs = Date.now();
    const baseUrl = credentials.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/models/${encodeURIComponent(request.model.modelIdentifier)}:generateContent`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(this.buildGeminiBody(request)),
        signal: request.abortSignal,
      });
    } catch (err) {
      throw new ProviderError({
        provider: 'gemini',
        category: 'network_error',
        retryable: true,
        message: `Gemini network transport failure: ${(err as Error).message}`,
      });
    }

    if (!response.ok) {
      throw classifyHttpError('gemini', response.status, await response.text());
    }

    const data = (await response.json()) as Record<string, unknown>;
    const latencyMs = Date.now() - startMs;
    const candidates = (data.candidates as Array<Record<string, unknown>>) || [];
    const firstCandidate = candidates[0] || {};
    const contentObj = (firstCandidate.content as Record<string, unknown>) || {};
    const parts = (contentObj.parts as Array<Record<string, unknown>>) || [];

    let textOut = '';
    const toolCalls: Array<{ id: string; name: string; argumentsJson: string }> = [];

    for (const part of parts) {
      if (typeof part.text === 'string') {
        textOut += part.text;
      }
      if (part.functionCall && typeof part.functionCall === 'object') {
        const fc = part.functionCall as Record<string, unknown>;
        toolCalls.push({
          id: `gemini_call_${toolCalls.length}`,
          name: String(fc.name || ''),
          argumentsJson: JSON.stringify(fc.args || {}),
        });
      }
    }

    const usageMeta = (data.usageMetadata as Record<string, unknown>) || {};
    const inputTokens =
      typeof usageMeta.promptTokenCount === 'number'
        ? usageMeta.promptTokenCount
        : estimateTokenCount(request.messages.map((m) => m.content).join('\n'));
    const outputTokens =
      typeof usageMeta.candidatesTokenCount === 'number'
        ? usageMeta.candidatesTokenCount
        : estimateTokenCount(textOut);
    const cachedInputTokens =
      typeof usageMeta.cachedContentTokenCount === 'number'
        ? usageMeta.cachedContentTokenCount
        : 0;

    return {
      provider: 'gemini',
      modelId: request.model.id,
      modelIdentifier: request.model.modelIdentifier,
      content: textOut,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        actualProviderCostUsd: null,
      },
      latencyMs,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  public async *stream(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): AsyncGenerator<ProviderStreamChunk, void, unknown> {
    const apiKey = this.ensureKey(credentials);
    const baseUrl = credentials.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/models/${encodeURIComponent(request.model.modelIdentifier)}:streamGenerateContent?alt=sse`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(this.buildGeminiBody(request)),
        signal: request.abortSignal,
      });
    } catch (err) {
      throw new ProviderError({
        provider: 'gemini',
        category: 'network_error',
        retryable: true,
        message: `Gemini streaming network error: ${(err as Error).message}`,
      });
    }

    if (!response.ok) {
      throw classifyHttpError('gemini', response.status, await response.text());
    }

    let accumulated = '';
    let latestUsage: ProviderStreamChunk['usage'] | undefined;

    for await (const frame of parseSseDataFrames(response.body, request.abortSignal)) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(frame) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (parsed.usageMetadata && typeof parsed.usageMetadata === 'object') {
        const u = parsed.usageMetadata as Record<string, unknown>;
        latestUsage = {
          inputTokens: Number(u.promptTokenCount || 0),
          outputTokens: Number(u.candidatesTokenCount || 0),
          cachedInputTokens: Number(u.cachedContentTokenCount || 0),
        };
      }
      const candidates = (parsed.candidates as Array<Record<string, unknown>>) || [];
      const contentObj = (candidates[0]?.content as Record<string, unknown>) || {};
      const parts = (contentObj.parts as Array<Record<string, unknown>>) || [];
      for (const p of parts) {
        if (typeof p.text === 'string' && p.text.length > 0) {
          accumulated += p.text;
          yield { deltaText: p.text, done: false };
        }
      }
    }

    yield {
      deltaText: '',
      done: true,
      finishReason: request.abortSignal?.aborted ? 'interrupted' : 'stop',
      usage: latestUsage ?? {
        inputTokens: estimateTokenCount(request.messages.map((m) => m.content).join('\n')),
        outputTokens: estimateTokenCount(accumulated),
        cachedInputTokens: 0,
      },
    };
  }

  public async checkHealth(credentials: ProviderCredentials): Promise<{
    healthy: boolean;
    configured: boolean;
    latencyMs: number;
    detail: string;
  }> {
    const configured = Boolean(credentials.apiKey && credentials.apiKey.trim());
    return {
      healthy: configured,
      configured,
      latencyMs: configured ? 1 : 0,
      detail: configured ? 'Gemini adapter configured and ready' : 'GEMINI_API_KEY not configured',
    };
  }
}
