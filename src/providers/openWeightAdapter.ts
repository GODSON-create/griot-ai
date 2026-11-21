// ============================================================================
// GRIOT AI — COMPATIBLE OPEN-WEIGHT / LOCAL OLLAMA ENDPOINT ADAPTER
// Supports Ollama (http://127.0.0.1:11434/v1), vLLM, SGLang, TGI, and
// OpenAI-compatible open-weight inference servers.
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
import { OllamaLocalRuntime } from './ollamaRuntime.ts';

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
    const baseUrl = (credentials.baseUrl || 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;

    const payload: Record<string, unknown> = {
      model: request.model.modelIdentifier,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxOutputTokens ?? 2048,
      stream: false,
    };

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
        headers: this.buildHeaders(credentials),
        body: JSON.stringify(payload),
        signal: request.abortSignal,
      });
    } catch (err) {
      throw new ProviderError({
        provider: 'open_weight',
        category: 'network_error',
        retryable: true,
        message: `Open-weight inference endpoint unreachable (${baseUrl}): ${(err as Error).message}`,
      });
    }

    if (!response.ok) {
      throw classifyHttpError('open_weight', response.status, await response.text());
    }

    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch (err) {
      throw new ProviderError({
        provider: 'open_weight',
        category: 'invalid_request',
        retryable: true,
        message: `Malformed JSON response from open-weight inference server: ${(err as Error).message}`,
      });
    }

    const latencyMs = Date.now() - startMs;
    const choices = (data.choices as Array<Record<string, unknown>>) || [];
    const messageObj = (choices[0]?.message as Record<string, unknown>) || {};
    const content = typeof messageObj.content === 'string' ? messageObj.content : '';
    const usageObj = (data.usage as Record<string, unknown>) || {};

    const rawToolCalls = (messageObj.tool_calls as Array<Record<string, unknown>>) || [];
    const toolCalls = rawToolCalls.map((tc) => {
      const fn = (tc.function as Record<string, unknown>) || {};
      return {
        id: String(tc.id || 'ow_call_0'),
        name: String(fn.name || ''),
        argumentsJson: String(fn.arguments || '{}'),
      };
    });

    const inputTokens =
      typeof usageObj.prompt_tokens === 'number'
        ? usageObj.prompt_tokens
        : estimateTokenCount(request.messages.map((m) => m.content).join('\n'));
    const outputTokens =
      typeof usageObj.completion_tokens === 'number'
        ? usageObj.completion_tokens
        : estimateTokenCount(content);

    return {
      provider: 'open_weight',
      modelId: request.model.id,
      modelIdentifier: request.model.modelIdentifier,
      content,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      executionMode: 'live',
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens: 0,
        actualProviderCostUsd:
          typeof usageObj.cost_usd === 'number' ? Number(usageObj.cost_usd) : 0,
      },
      latencyMs,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      rawMetadata: {
        inferenceRuntime: 'local_open_weight',
        endpoint: baseUrl,
        tokensPerSecond:
          latencyMs > 0 ? Number(((outputTokens / latencyMs) * 1000).toFixed(2)) : 0,
      },
    };
  }

  public async *stream(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): AsyncGenerator<ProviderStreamChunk, void, unknown> {
    const baseUrl = (credentials.baseUrl || 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: this.buildHeaders(credentials),
        body: JSON.stringify({
          model: request.model.modelIdentifier,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxOutputTokens ?? 2048,
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
        yield { deltaText: delta.content, done: false, executionMode: 'live' };
      }
    }

    yield {
      deltaText: '',
      done: true,
      finishReason: request.abortSignal?.aborted ? 'interrupted' : 'stop',
      executionMode: 'live',
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
    const startMs = Date.now();
    const runtime = new OllamaLocalRuntime({
      baseUrl: credentials.baseUrl || 'http://127.0.0.1:11434/v1',
      fetchFn: this.fetchFn,
    });
    const status = await runtime.inspectRuntime(2500);
    const latencyMs = Date.now() - startMs;
    if (status.apiReachable) {
      return {
        healthy: true,
        configured: true,
        latencyMs,
        detail: `Ollama v${status.ollamaVersion} reachable at ${status.apiBaseUrl} (${status.installedModels.length} local model(s) installed)`,
      };
    }
    return {
      healthy: Boolean(credentials.apiKey),
      configured: Boolean(credentials.apiKey || status.binaryInstalled),
      latencyMs,
      detail: status.error || `Open-weight endpoint standby (${credentials.baseUrl})`,
    };
  }
}
