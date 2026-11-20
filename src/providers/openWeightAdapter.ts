// ============================================================================
// GRIOT AI — COMPATIBLE OPEN-WEIGHT / SELF-HOSTED MODEL ENDPOINT ADAPTER
// Supports vLLM, Ollama, SGLang, TGI, and OpenAI-compatible inference servers
// ============================================================================

import type {
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

export class OpenWeightProviderAdapter implements ModelProviderAdapter {
  public readonly providerName = 'open_weight' as const;
  private readonly fetchFn: FetchFunction;

  constructor(fetchFn: FetchFunction = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private buildHeaders(credentials: ProviderCredentials): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (credentials.apiKey && credentials.apiKey.trim()) {
      headers.Authorization = `Bearer ${credentials.apiKey.trim()}`;
    }
    return headers;
  }

  public async generate(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): Promise<ProviderGenerationResponse> {
    const startMs = Date.now();
    const url = `${credentials.baseUrl.replace(/\/$/, '')}/chat/completions`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: this.buildHeaders(credentials),
        body: JSON.stringify({
          model: request.model.modelIdentifier,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxOutputTokens ?? 2048,
          stream: false,
        }),
        signal: request.abortSignal,
      });
    } catch (err) {
      throw new ProviderError({
        provider: 'open_weight',
        category: 'network_error',
        retryable: true,
        message: `Open-weight inference endpoint unreachable (${credentials.baseUrl}): ${(err as Error).message}`,
      });
    }

    if (!response.ok) {
      throw classifyHttpError('open_weight', response.status, await response.text());
    }

    const data = (await response.json()) as Record<string, unknown>;
    const latencyMs = Date.now() - startMs;
    const choices = (data.choices as Array<Record<string, unknown>>) || [];
    const messageObj = (choices[0]?.message as Record<string, unknown>) || {};
    const content = typeof messageObj.content === 'string' ? messageObj.content : '';
    const usageObj = (data.usage as Record<string, unknown>) || {};

    return {
      provider: 'open_weight',
      modelId: request.model.id,
      modelIdentifier: request.model.modelIdentifier,
      content,
      finishReason: 'stop',
      usage: {
        inputTokens:
          typeof usageObj.prompt_tokens === 'number'
            ? usageObj.prompt_tokens
            : estimateTokenCount(request.messages.map((m) => m.content).join('\n')),
        outputTokens:
          typeof usageObj.completion_tokens === 'number'
            ? usageObj.completion_tokens
            : estimateTokenCount(content),
        cachedInputTokens: 0,
        actualProviderCostUsd:
          typeof usageObj.cost_usd === 'number' ? Number(usageObj.cost_usd) : null,
      },
      latencyMs,
    };
  }

  public async *stream(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): AsyncGenerator<ProviderStreamChunk, void, unknown> {
    const url = `${credentials.baseUrl.replace(/\/$/, '')}/chat/completions`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: this.buildHeaders(credentials),
        body: JSON.stringify({
          model: request.model.modelIdentifier,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: request.abortSignal,
      });
    } catch (err) {
      throw new ProviderError({
        provider: 'open_weight',
        category: 'network_error',
        retryable: true,
        message: `Open-weight streaming endpoint unreachable: ${(err as Error).message}`,
      });
    }

    if (!response.ok) {
      throw classifyHttpError('open_weight', response.status, await response.text());
    }

    let accumulated = '';
    for await (const frame of parseSseDataFrames(response.body, request.abortSignal)) {
      if (frame === '[DONE]') break;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(frame) as Record<string, unknown>;
      } catch {
        continue;
      }
      const choices = (parsed.choices as Array<Record<string, unknown>>) || [];
      const delta = (choices[0]?.delta as Record<string, unknown>) || {};
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        accumulated += delta.content;
        yield { deltaText: delta.content, done: false };
      }
    }

    yield {
      deltaText: '',
      done: true,
      finishReason: request.abortSignal?.aborted ? 'interrupted' : 'stop',
      usage: {
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
    const configured = Boolean(credentials.apiKey || credentials.baseUrl);
    return {
      healthy: Boolean(credentials.apiKey),
      configured,
      latencyMs: 0,
      detail: credentials.apiKey
        ? `Open-weight endpoint configured at ${credentials.baseUrl}`
        : `Open-weight endpoint standby (${credentials.baseUrl})`,
    };
  }
}
