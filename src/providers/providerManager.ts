// ============================================================================
// GRIOT AI — PROVIDER MANAGER, CREDENTIAL RESOLVER & CIRCUIT BREAKER
// ============================================================================

import type { GriotConfig } from '../config/env.ts';
import type { TenantService } from '../tenancy/tenantService.ts';
import type { ProviderName } from '../types/domain.ts';
import type { FetchFunction, ModelProviderAdapter, ProviderCredentials } from './adapter.ts';
import { AnthropicProviderAdapter } from './anthropicAdapter.ts';
import { GeminiProviderAdapter } from './geminiAdapter.ts';
import { MistralProviderAdapter } from './mistralAdapter.ts';
import { OpenAiProviderAdapter } from './openaiAdapter.ts';
import { OpenWeightProviderAdapter } from './openWeightAdapter.ts';

export interface ProviderHealthState {
  provider: ProviderName;
  configured: boolean;
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

  constructor(params: {
    config: GriotConfig;
    tenantService: TenantService;
    fetchFn?: FetchFunction;
  }) {
    this.config = params.config;
    this.tenantService = params.tenantService;

    const fetchFn = params.fetchFn ?? globalThis.fetch;
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

  /**
   * Resolves credentials for a provider without hardcoding:
   * 1. Checks organisation encrypted vault (`provider_credentials_vault`) first
   * 2. Falls back to environment configuration (`config.providers[provider]`)
   */
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

  public isProviderAvailable(provider: ProviderName, orgId?: string): boolean {
    const state = this.healthStates.get(provider);
    if (state && state.circuitOpenUntilMs > Date.now()) {
      return false;
    }
    const creds = this.resolveCredentials(provider, orgId);
    if (provider === 'open_weight') {
      return Boolean(creds.apiKey && creds.apiKey.trim());
    }
    return Boolean(creds.apiKey && creds.apiKey.trim());
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
    // Open circuit breaker for 30 seconds after 3 consecutive failures
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
      const creds = this.resolveCredentials(p, orgId);
      const configured = Boolean(creds.apiKey && creds.apiKey.trim());
      return {
        provider: p,
        configured,
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
