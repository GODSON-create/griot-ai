// ============================================================================
// GRIOT AI — PROVIDER MANAGER, CREDENTIAL RESOLVER, OLLAMA RUNTIME & CONCURRENCY
// Supports live official provider adapters, local Ollama open-weight execution
// with concurrency & queue controls, configurable timeouts & retries, circuit
// breaker failover, and clearly distinguished development mock mode.
// ============================================================================

import type { GriotConfig } from '../config/env.ts';
import { LocalInferenceConcurrencyController } from '../economics/concurrencyLimiter.ts';
import type { TenantService } from '../tenancy/tenantService.ts';
import type {
  ProviderGenerationRequest,
  ProviderGenerationResponse,
  ProviderName,
  ProviderStreamChunk,
} from '../types/domain.ts';
import {
  estimateTokenCount,
  ProviderError,
  type FetchFunction,
  type ModelProviderAdapter,
  type ProviderCredentials,
} from './adapter.ts';
import { AnthropicProviderAdapter } from './anthropicAdapter.ts';
import { GeminiProviderAdapter } from './geminiAdapter.ts';
import { MistralProviderAdapter } from './mistralAdapter.ts';
import { OllamaLocalRuntime, type OllamaRuntimeStatus } from './ollamaRuntime.ts';
import { OpenAiProviderAdapter } from './openaiAdapter.ts';
import { OpenWeightProviderAdapter } from './openWeightAdapter.ts';

export interface ProviderHealthState {
  provider: ProviderName;
  configured: boolean;
  mode: 'live' | 'mock_fallback' | 'unconfigured';
  circuitOpen: boolean;
  consecutiveFailures: number;
  totalRequests: number;
  totalErrors: number;
  avgLatencyMs: number;
  lastError: string | null;
  lastCheckedAt: string;
}

export class ProviderManager {
  private readonly adapters = new Map<ProviderName, ModelProviderAdapter>();
  private readonly healthStates = new Map<
    ProviderName,
    {
      consecutiveFailures: number;
      circuitOpenUntilMs: number;
      totalRequests: number;
      totalErrors: number;
      totalLatencyMs: number;
      lastError: string | null;
    }
  >();
  private readonly config: GriotConfig;
  private readonly tenantService: TenantService;
  public readonly ollamaRuntime: OllamaLocalRuntime;
  public readonly localConcurrency: LocalInferenceConcurrencyController;

  constructor(params: {
    config: GriotConfig;
    tenantService: TenantService;
    fetchFn?: FetchFunction;
  }) {
    this.config = params.config;
    this.tenantService = params.tenantService;

    const fetchFn = params.fetchFn ?? globalThis.fetch;
    this.ollamaRuntime = new OllamaLocalRuntime({
      baseUrl: this.config.providers.open_weight.baseUrl,
      fetchFn,
    });
    this.localConcurrency = new LocalInferenceConcurrencyController();

    this.registerAdapter(new OpenAiProviderAdapter(fetchFn));
    this.registerAdapter(new GeminiProviderAdapter(fetchFn));
    this.registerAdapter(new AnthropicProviderAdapter(fetchFn));
    this.registerAdapter(new MistralProviderAdapter(fetchFn));
    this.registerAdapter(new OpenWeightProviderAdapter(fetchFn));
  }

  public registerAdapter(adapter: ModelProviderAdapter): void {
    this.adapters.set(adapter.providerName, adapter);
    if (!this.healthStates.has(adapter.providerName)) {
      this.healthStates.set(adapter.providerName, {
        consecutiveFailures: 0,
        circuitOpenUntilMs: 0,
        totalRequests: 0,
        totalErrors: 0,
        totalLatencyMs: 0,
        lastError: null,
      });
    }
  }

  public getAdapter(provider: ProviderName): ModelProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No provider adapter registered for '${provider}'`);
    }
    return adapter;
  }

  public resolveCredentials(provider: ProviderName, orgId?: string): ProviderCredentials {
    const envEntry = this.config.providers[provider] || { apiKey: null, baseUrl: '' };
    if (orgId) {
      const vaultKey = this.tenantService.getOrgProviderCredential(orgId, provider);
      if (vaultKey) {
        return {
          apiKey: vaultKey,
          baseUrl: envEntry.baseUrl,
        };
      }
    }
    return {
      apiKey: envEntry.apiKey,
      baseUrl: envEntry.baseUrl,
    };
  }

  public hasLiveCredentials(provider: ProviderName, orgId?: string): boolean {
    const creds = this.resolveCredentials(provider, orgId);
    return Boolean(creds.apiKey && creds.apiKey.trim());
  }

  public isProviderAvailable(provider: ProviderName, orgId?: string): boolean {
    const state = this.healthStates.get(provider);
    if (state && state.circuitOpenUntilMs > Date.now()) {
      return false;
    }
    if (this.hasLiveCredentials(provider, orgId)) {
      return true;
    }
    return this.config.allowMockProvidersWhenUnconfigured;
  }

  public async inspectLocalOllamaStatus(timeoutMs = 2500): Promise<OllamaRuntimeStatus> {
    return this.ollamaRuntime.inspectRuntime(timeoutMs);
  }

  /**
   * Executes generation with timeout handling, retry limits, local concurrency/queue
   * controls, and transparent mock fallback when live credentials are absent and
   * `allowMockProvidersWhenUnconfigured` is enabled.
   */
  public async executeGenerate(
    request: ProviderGenerationRequest,
    orgId?: string
  ): Promise<ProviderGenerationResponse> {
    const provider = request.model.provider;
    const credentials = this.resolveCredentials(provider, orgId);
    const hasLiveKey = Boolean(credentials.apiKey && credentials.apiKey.trim());

    if (!hasLiveKey && this.config.allowMockProvidersWhenUnconfigured) {
      return this.generateMockResponse(request);
    }

    const releaseSlot =
      provider === 'open_weight' ? await this.localConcurrency.acquireSlot() : null;

    try {
      const adapter = this.getAdapter(provider);
      const maxAttempts = Math.max(1, 1 + (this.config.maxRetriesPerProvider ?? 1));
      const timeoutMs = request.timeoutMs ?? this.config.requestTimeoutMs ?? 30000;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const timeoutController = new AbortController();
        const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
        const onCallerAbort = () => timeoutController.abort();
        request.abortSignal?.addEventListener('abort', onCallerAbort, { once: true });

        try {
          const res = await adapter.generate(
            {
              ...request,
              abortSignal: timeoutController.signal,
            },
            credentials
          );
          res.executionMode = 'live';
          this.recordSuccess(provider, res.latencyMs);
          return res;
        } catch (err) {
          if (timeoutController.signal.aborted && !request.abortSignal?.aborted) {
            lastError = new ProviderError({
              provider,
              category: 'timeout',
              statusCode: 504,
              retryable: true,
              message: `${provider} request timed out after ${timeoutMs}ms`,
            });
          } else {
            lastError = err as Error;
          }
          const canRetry =
            attempt < maxAttempts &&
            lastError instanceof ProviderError &&
            lastError.retryable;
          if (!canRetry) {
            this.recordFailure(provider, lastError.message);
            throw lastError;
          }
        } finally {
          clearTimeout(timer);
          request.abortSignal?.removeEventListener('abort', onCallerAbort);
        }
      }

      throw lastError || new Error(`Provider '${provider}' failed after ${maxAttempts} attempts`);
    } finally {
      if (releaseSlot) releaseSlot();
    }
  }

  public async *executeStream(
    request: ProviderGenerationRequest,
    orgId?: string
  ): AsyncGenerator<ProviderStreamChunk, void, unknown> {
    const provider = request.model.provider;
    const credentials = this.resolveCredentials(provider, orgId);
    const hasLiveKey = Boolean(credentials.apiKey && credentials.apiKey.trim());

    if (!hasLiveKey && this.config.allowMockProvidersWhenUnconfigured) {
      yield* this.streamMockResponse(request);
      return;
    }

    const releaseSlot =
      provider === 'open_weight' ? await this.localConcurrency.acquireSlot() : null;
    try {
      const adapter = this.getAdapter(provider);
      for await (const chunk of adapter.stream(request, credentials)) {
        yield { ...chunk, executionMode: 'live' };
      }
    } finally {
      if (releaseSlot) releaseSlot();
    }
  }

  private async generateMockResponse(
    request: ProviderGenerationRequest
  ): Promise<ProviderGenerationResponse> {
    const startMs = Date.now();
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const promptPreview = (lastUser?.content || 'Hello').slice(0, 120);
    const inputTokens = estimateTokenCount(
      request.messages.map((m) => m.content).join('\n')
    );

    const mockText =
      request.responseFormat === 'json_object'
        ? JSON.stringify({
            executionMode: 'mock',
            model: request.model.id,
            provider: request.model.provider,
            summary: `Simulated GRIOT development response for: ${promptPreview}`,
          })
        : `[GRIOT MOCK ADAPTER — ${request.model.displayName} (${request.model.id})] Simulated response for: "${promptPreview}"`;

    const outputTokens = estimateTokenCount(mockText);
    const latencyMs = Math.max(1, Date.now() - startMs);
    this.recordSuccess(request.model.provider, latencyMs);

    return {
      provider: request.model.provider,
      modelId: request.model.id,
      modelIdentifier: request.model.modelIdentifier,
      content: mockText,
      finishReason: 'stop',
      executionMode: 'mock',
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens: 0,
        actualProviderCostUsd: null,
      },
      latencyMs,
      rawMetadata: {
        executionMode: 'mock',
        notice:
          'Simulated by GRIOT Mock Adapter because no live provider credentials were configured.',
      },
    };
  }

  private async *streamMockResponse(
    request: ProviderGenerationRequest
  ): AsyncGenerator<ProviderStreamChunk, void, unknown> {
    const res = await this.generateMockResponse(request);
    const words = res.content.split(' ');
    let accumulated = '';
    for (let i = 0; i < words.length; i++) {
      if (request.abortSignal?.aborted) {
        yield {
          deltaText: '',
          done: true,
          finishReason: 'interrupted',
          executionMode: 'mock',
          usage: {
            inputTokens: res.usage.inputTokens,
            outputTokens: estimateTokenCount(accumulated),
            cachedInputTokens: 0,
          },
        };
        return;
      }
      const delta = (i === 0 ? '' : ' ') + words[i];
      accumulated += delta;
      yield {
        deltaText: delta,
        done: false,
        executionMode: 'mock',
      };
    }
    yield {
      deltaText: '',
      done: true,
      finishReason: 'stop',
      executionMode: 'mock',
      usage: res.usage,
    };
  }

  public recordSuccess(provider: ProviderName, latencyMs: number): void {
    const state = this.healthStates.get(provider);
    if (!state) return;
    state.consecutiveFailures = 0;
    state.circuitOpenUntilMs = 0;
    state.totalRequests += 1;
    state.totalLatencyMs += Math.max(0, latencyMs);
  }

  public recordFailure(provider: ProviderName, errorMessage: string): void {
    const state = this.healthStates.get(provider);
    if (!state) return;
    state.consecutiveFailures += 1;
    state.totalRequests += 1;
    state.totalErrors += 1;
    state.lastError = errorMessage;
    if (state.consecutiveFailures >= 3) {
      state.circuitOpenUntilMs = Date.now() + 30_000;
    }
  }

  public resetCircuit(provider?: ProviderName): void {
    for (const [name, state] of this.healthStates.entries()) {
      if (!provider || name === provider) {
        state.consecutiveFailures = 0;
        state.circuitOpenUntilMs = 0;
        state.lastError = null;
      }
    }
  }

  public getProviderStatuses(orgId?: string): ProviderHealthState[] {
    const providers: ProviderName[] = [
      'openai',
      'gemini',
      'anthropic',
      'mistral',
      'open_weight',
    ];
    const now = Date.now();
    return providers.map((p) => {
      const state = this.healthStates.get(p)!;
      const configured = this.hasLiveCredentials(p, orgId);
      return {
        provider: p,
        configured,
        mode: configured
          ? 'live'
          : this.config.allowMockProvidersWhenUnconfigured
            ? 'mock_fallback'
            : 'unconfigured',
        circuitOpen: state.circuitOpenUntilMs > now,
        consecutiveFailures: state.consecutiveFailures,
        totalRequests: state.totalRequests,
        totalErrors: state.totalErrors,
        avgLatencyMs:
          state.totalRequests > 0
            ? Math.round(state.totalLatencyMs / state.totalRequests)
            : 0,
        lastError: state.lastError,
        lastCheckedAt: new Date(now).toISOString(),
      };
    });
  }
}
