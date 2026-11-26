// ============================================================================
// GRIOT AI — STANDARD MODEL PROVIDER ADAPTER INTERFACE & SSE PARSER
// ============================================================================

import type {
  ProviderGenerationRequest,
  ProviderGenerationResponse,
  ProviderName,
  ProviderStreamChunk,
} from '../types/domain.ts';

export type ProviderErrorCategory =
  | 'auth_error'
  | 'rate_limit'
  | 'quota_exceeded'
  | 'provider_unavailable'
  | 'invalid_request'
  | 'timeout'
  | 'network_error';

export class ProviderError extends Error {
  public readonly provider: ProviderName;
  public readonly category: ProviderErrorCategory;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(params: {
    provider: ProviderName;
    message: string;
    category: ProviderErrorCategory;
    statusCode?: number;
    retryable?: boolean;
  }) {
    super(params.message);
    this.name = 'ProviderError';
    this.provider = params.provider;
    this.category = params.category;
    this.statusCode = params.statusCode ?? 502;
    this.retryable =
      params.retryable ??
      ['rate_limit', 'provider_unavailable', 'timeout', 'network_error'].includes(
        params.category
      );
  }
}

export interface ProviderCredentials {
  apiKey: string | null;
  baseUrl: string;
}

export interface ProviderEmbeddingRequest {
  modelIdentifier: string;
  inputs: string[];
}

export interface ProviderEmbeddingResponse {
  provider: ProviderName;
  modelIdentifier: string;
  embeddings: number[][];
  inputTokens: number;
}

export interface ModelProviderAdapter {
  readonly providerName: ProviderName;

  generate(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): Promise<ProviderGenerationResponse>;

  stream(
    request: ProviderGenerationRequest,
    credentials: ProviderCredentials
  ): AsyncGenerator<ProviderStreamChunk, void, unknown>;

  embed?(
    request: ProviderEmbeddingRequest,
    credentials: ProviderCredentials
  ): Promise<ProviderEmbeddingResponse>;

  checkHealth(credentials: ProviderCredentials): Promise<{
    healthy: boolean;
    configured: boolean;
    latencyMs: number;
    detail: string;
  }>;
}

export type FetchFunction = typeof globalThis.fetch;

export function classifyHttpError(
  provider: ProviderName,
  status: number,
  bodyText: string
): ProviderError {
  const snippet = bodyText.slice(0, 1200);
  if (status === 401 || status === 403) {
    return new ProviderError({
      provider,
      statusCode: status,
      category: 'auth_error',
      retryable: false,
      message: `${provider} authentication failed (HTTP ${status}): ${snippet}`,
    });
  }
  if (status === 429) {
    const isQuota = /quota|insufficient_quota|credit|billing/i.test(snippet);
    return new ProviderError({
      provider,
      statusCode: status,
      category: isQuota ? 'quota_exceeded' : 'rate_limit',
      retryable: true,
      message: `${provider} ${isQuota ? 'quota exceeded' : 'rate limited'} (HTTP 429): ${snippet}`,
    });
  }
  if (status >= 500) {
    return new ProviderError({
      provider,
      statusCode: status,
      category: 'provider_unavailable',
      retryable: true,
      message: `${provider} upstream service error (HTTP ${status}): ${snippet}`,
    });
  }
  return new ProviderError({
    provider,
    statusCode: status,
    category: 'invalid_request',
    retryable: false,
    message: `${provider} rejected request (HTTP ${status}): ${snippet}`,
  });
}

/**
 * Parses Server-Sent Events (SSE) data frames from a fetch Response body stream.
 */
export async function* parseSseDataFrames(
  body: ReadableStream<Uint8Array> | null,
  abortSignal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      if (abortSignal?.aborted) {
        await reader.cancel();
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (line.startsWith('data:')) {
          const dataPayload = line.slice(5).trim();
          if (dataPayload) {
            yield dataPayload;
          }
        }
      }
    }
    const remaining = buffer.trim();
    if (remaining.startsWith('data:')) {
      const dataPayload = remaining.slice(5).trim();
      if (dataPayload) {
        yield dataPayload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Standard heuristic: ~4 chars per token for English/code/African Latin scripts
  return Math.max(1, Math.ceil(text.length / 4));
}
