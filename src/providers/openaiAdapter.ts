// ============================================================================
// GRIOT AI — OPENAI OFFICIAL API ADAPTER
// Supports /v1/chat/completions (sync + SSE streaming) and /v1/embeddings
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
  type ProviderEmbeddingRequest,
  type ProviderEmbeddingResponse,
} from './adapter.ts';

export class OpenAiProviderAdapter implements ModelProviderAdapter {
  public readonly providerName = 'openai' as const;
  private readonly fetchFn: FetchFunction;

  constructor(fetchFn: FetchFunction = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private ensureKey(credentials: ProviderCredentials): string {
    if (!credentials.apiKey || !credentials.apiKey.trim()) {
      throw new ProviderError({
        provider: 'openai',
        category: 'auth_error',
        statusCode: 401,
        retryable: false,
        message: 'OpenAI API key is not configured.',
      });
    }
    return credentials.apiKey.trim();
  }

  private formatMessages(messages: ChatMessageInput[]): unknown[] {
    return messages.map((msg) => {
      if (msg.attachments && msg.attachments.length > 0) {
        const parts: Array<Record<string, unknown>> = [{ type: 'text', text: msg.content }];
        for (const att of msg.attachments) {
          if (att.modality === 'image' && att.inlineBase64) {
            parts.push({
              type: 'image_url',
              image_url: {
                url: `data:${att.mimeType};base64,${att.inlineBase64}`,
              },
            });
          } else if (att.extractedText) {
            parts.push({
              type: 'text',
              text: `[Attached ${att.originalName}]:\n${att.extractedText}`,
            });
          }
        }
        return { role: msg.role, content: parts };
      }
      return { role: msg.role, content: msg.content };
    });
  }

  public async generate(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): Promise<ProviderGenerationResponse> {
    const apiKey = this.ensureKey(credentials);
    const startMs = Date.now();
    const url = `${credentials.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const payload: Record<string, unknown> = {
      model: request.model.modelIdentifier,
      messages: this.formatMessages(request.messages),
      stream: false,
    };

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.maxOutputTokens !== undefined) {
      payload.max_tokens = request.maxOutputTokens;
    }
    if (request.responseFormat === 'json_object') {
      payload.response_format = { type: 'json_object' };
    }
    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parametersSchema,
        },
      }));
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: request.abortSignal,
      });
    } catch (err) {
      throw new ProviderError({
        provider: 'openai',
        category: 'network_error',
        retryable: true,
        message: `OpenAI network transport failure: ${(err as Error).message}`,
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      throw classifyHttpError('openai', response.status, errText);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const latencyMs = Date.now() - startMs;
    const choices = (data.choices as Array<Record<string, unknown>>) || [];
    const firstChoice = choices[0] || {};
    const messageObj = (firstChoice.message as Record<string, unknown>) || {};
    const content = typeof messageObj.content === 'string' ? messageObj.content : '';

    const rawToolCalls = (messageObj.tool_calls as Array<Record<string, unknown>>) || [];
    const toolCalls = rawToolCalls.map((tc) => {
      const fn = (tc.function as Record<string, unknown>) || {};
      return {
        id: String(tc.id || 'call_0'),
        name: String(fn.name || ''),
        argumentsJson: String(fn.arguments || '{}'),
      };
    });

    const usageObj = (data.usage as Record<string, unknown>) || {};
    const promptDetails =
      (usageObj.prompt_tokens_details as Record<string, unknown>) || {};
    const inputTokens =
      typeof usageObj.prompt_tokens === 'number'
        ? usageObj.prompt_tokens
        : estimateTokenCount(request.messages.map((m) => m.content).join('\n'));
    const outputTokens =
      typeof usageObj.completion_tokens === 'number'
        ? usageObj.completion_tokens
        : estimateTokenCount(content);
    const cachedInputTokens =
      typeof promptDetails.cached_tokens === 'number' ? promptDetails.cached_tokens : 0;
    const actualCost =
      typeof usageObj.cost_usd === 'number' ? Number(usageObj.cost_usd) : null;

    return {
      provider: 'openai',
      modelId: request.model.id,
      modelIdentifier: request.model.modelIdentifier,
      content,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        actualProviderCostUsd: actualCost,
      },
      latencyMs,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      rawMetadata: { upstreamId: data.id },
    };
  }

  public async *stream(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): AsyncGenerator<ProviderStreamChunk, void, unknown> {
    const apiKey = this.ensureKey(credentials);
    const url = `${credentials.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const payload: Record<string, unknown> = {
      model: request.model.modelIdentifier,
      messages: this.formatMessages(request.messages),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (request.temperature !== undefined) payload.temperature = request.temperature;
    if (request.maxOutputTokens !== undefined) payload.max_tokens = request.maxOutputTokens;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: request.abortSignal,
      });
    } catch (err) {
      throw new ProviderError({
        provider: 'openai',
        category: 'network_error',
        retryable: true,
        message: `OpenAI streaming network error: ${(err as Error).message}`,
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      throw classifyHttpError('openai', response.status, errText);
    }

    let accumulatedText = '';
    let latestUsage: ProviderStreamChunk['usage'] | undefined;

    for await (const frame of parseSseDataFrames(response.body, request.abortSignal)) {
      if (frame === '[DONE]') {
        break;
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(frame) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (parsed.usage && typeof parsed.usage === 'object') {
        const u = parsed.usage as Record<string, unknown>;
        const details = (u.prompt_tokens_details as Record<string, unknown>) || {};
        latestUsage = {
          inputTokens: Number(u.prompt_tokens || 0),
          outputTokens: Number(u.completion_tokens || 0),
          cachedInputTokens: Number(details.cached_tokens || 0),
        };
      }
      const choices = (parsed.choices as Array<Record<string, unknown>>) || [];
      const delta = (choices[0]?.delta as Record<string, unknown>) || {};
      const deltaText = typeof delta.content === 'string' ? delta.content : '';
      if (deltaText) {
        accumulatedText += deltaText;
        yield { deltaText, done: false };
      }
    }

    yield {
      deltaText: '',
      done: true,
      finishReason: request.abortSignal?.aborted ? 'interrupted' : 'stop',
      usage: latestUsage ?? {
        inputTokens: estimateTokenCount(request.messages.map((m) => m.content).join('\n')),
        outputTokens: estimateTokenCount(accumulatedText),
        cachedInputTokens: 0,
      },
    };
  }

  public async embed(
    request: ProviderEmbeddingRequest,
    credentials: ProviderCredentials
  ): Promise<ProviderEmbeddingResponse> {
    const apiKey = this.ensureKey(credentials);
    const url = `${credentials.baseUrl.replace(/\/$/, '')}/embeddings`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.modelIdentifier,
        input: request.inputs,
      }),
    });
    if (!response.ok) {
      throw classifyHttpError('openai', response.status, await response.text());
    }
    const data = (await response.json()) as Record<string, unknown>;
    const items = (data.data as Array<{ embedding: number[] }>) || [];
    const usage = (data.usage as Record<string, unknown>) || {};
    return {
      provider: 'openai',
      modelIdentifier: request.modelIdentifier,
      embeddings: items.map((i) => i.embedding),
      inputTokens: Number(
        usage.prompt_tokens || estimateTokenCount(request.inputs.join('\n'))
      ),
    };
  }

  public async checkHealth(credentials: ProviderCredentials): Promise<{
    healthy: boolean;
    configured: boolean;
    latencyMs: number;
    detail: string;
  }> {
    const configured = Boolean(credentials.apiKey && credentials.apiKey.trim());
    if (!configured) {
      return {
        healthy: false,
        configured: false,
        latencyMs: 0,
        detail: 'OPENAI_API_KEY not configured',
      };
    }
    return {
      healthy: true,
      configured: true,
      latencyMs: 1,
      detail: 'OpenAI adapter configured and ready',
    };
  }
}
