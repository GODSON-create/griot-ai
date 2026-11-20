// ============================================================================
// GRIOT AI — ANTHROPIC MESSAGES OFFICIAL API ADAPTER
// Supports /v1/messages (sync + SSE streaming) with cache token tracking
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

export class AnthropicProviderAdapter implements ModelProviderAdapter {
  public readonly providerName = 'anthropic' as const;
  private readonly fetchFn: FetchFunction;

  constructor(fetchFn: FetchFunction = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  private ensureKey(credentials: ProviderCredentials): string {
    if (!credentials.apiKey || !credentials.apiKey.trim()) {
      throw new ProviderError({
        provider: 'anthropic',
        category: 'auth_error',
        statusCode: 401,
        retryable: false,
        message: 'Anthropic API key is not configured.',
      });
    }
    return credentials.apiKey.trim();
  }

  private buildAnthropicPayload(
    request: ProviderGenerationRequest,
    stream: boolean
  ): Record<string, unknown> {
    const systemText = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const chatMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.attachments && m.attachments.length > 0) {
          const blocks: Array<Record<string, unknown>> = [];
          for (const att of m.attachments) {
            if (att.modality === 'image' && att.inlineBase64) {
              blocks.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: att.mimeType,
                  data: att.inlineBase64,
                },
              });
            } else if (att.modality === 'pdf' && att.inlineBase64) {
              blocks.push({
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: att.inlineBase64,
                },
              });
            } else if (att.extractedText) {
              blocks.push({
                type: 'text',
                text: `[Attachment ${att.originalName}]:\n${att.extractedText}`,
              });
            }
          }
          blocks.push({ type: 'text', text: m.content });
          return {
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: blocks,
          };
        }
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        };
      });

    const payload: Record<string, unknown> = {
      model: request.model.modelIdentifier,
      max_tokens: request.maxOutputTokens ?? Math.min(4096, request.model.maxOutputTokens),
      messages:
        chatMessages.length > 0 ? chatMessages : [{ role: 'user', content: systemText || 'Hello' }],
      stream,
    };

    if (systemText) {
      payload.system = systemText;
    }
    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parametersSchema,
      }));
    }

    return payload;
  }

  public async generate(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): Promise<ProviderGenerationResponse> {
    const apiKey = this.ensureKey(credentials);
    const startMs = Date.now();
    const url = `${credentials.baseUrl.replace(/\/$/, '')}/messages`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(this.buildAnthropicPayload(request, false)),
        signal: request.abortSignal,
      });
    } catch (err) {
      throw new ProviderError({
        provider: 'anthropic',
        category: 'network_error',
        retryable: true,
        message: `Anthropic network transport failure: ${(err as Error).message}`,
      });
    }

    if (!response.ok) {
      throw classifyHttpError('anthropic', response.status, await response.text());
    }

    const data = (await response.json()) as Record<string, unknown>;
    const latencyMs = Date.now() - startMs;
    const blocks = (data.content as Array<Record<string, unknown>>) || [];

    let textOut = '';
    const toolCalls: Array<{ id: string; name: string; argumentsJson: string }> = [];

    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textOut += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: String(block.id || 'tool_0'),
          name: String(block.name || ''),
          argumentsJson: JSON.stringify(block.input || {}),
        });
      }
    }

    const usageObj = (data.usage as Record<string, unknown>) || {};
    const inputTokens =
      typeof usageObj.input_tokens === 'number'
        ? usageObj.input_tokens
        : estimateTokenCount(request.messages.map((m) => m.content).join('\n'));
    const outputTokens =
      typeof usageObj.output_tokens === 'number'
        ? usageObj.output_tokens
        : estimateTokenCount(textOut);
    const cachedInputTokens =
      typeof usageObj.cache_read_input_tokens === 'number'
        ? usageObj.cache_read_input_tokens
        : 0;

    return {
      provider: 'anthropic',
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
      rawMetadata: { upstreamId: data.id },
    };
  }

  public async *stream(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): AsyncGenerator<ProviderStreamChunk, void, unknown> {
    const apiKey = this.ensureKey(credentials);
    const url = `${credentials.baseUrl.replace(/\/$/, '')}/messages`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(this.buildAnthropicPayload(request, true)),
        signal: request.abortSignal,
      });
    } catch (err) {
      throw new ProviderError({
        provider: 'anthropic',
        category: 'network_error',
        retryable: true,
        message: `Anthropic streaming network error: ${(err as Error).message}`,
      });
    }

    if (!response.ok) {
      throw classifyHttpError('anthropic', response.status, await response.text());
    }

    let accumulated = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;

    for await (const frame of parseSseDataFrames(response.body, request.abortSignal)) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(frame) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (parsed.type === 'message_start' && parsed.message) {
        const msg = parsed.message as Record<string, unknown>;
        const u = (msg.usage as Record<string, unknown>) || {};
        inputTokens = Number(u.input_tokens || 0);
        cachedTokens = Number(u.cache_read_input_tokens || 0);
      } else if (parsed.type === 'content_block_delta' && parsed.delta) {
        const delta = parsed.delta as Record<string, unknown>;
        if (typeof delta.text === 'string' && delta.text.length > 0) {
          accumulated += delta.text;
          yield { deltaText: delta.text, done: false };
        }
      } else if (parsed.type === 'message_delta' && parsed.usage) {
        const u = parsed.usage as Record<string, unknown>;
        outputTokens = Number(u.output_tokens || outputTokens);
      }
    }

    yield {
      deltaText: '',
      done: true,
      finishReason: request.abortSignal?.aborted ? 'interrupted' : 'stop',
      usage: {
        inputTokens:
          inputTokens || estimateTokenCount(request.messages.map((m) => m.content).join('\n')),
        outputTokens: outputTokens || estimateTokenCount(accumulated),
        cachedInputTokens: cachedTokens,
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
      detail: configured
        ? 'Anthropic adapter configured and ready'
        : 'ANTHROPIC_API_KEY not configured',
    };
  }
}
