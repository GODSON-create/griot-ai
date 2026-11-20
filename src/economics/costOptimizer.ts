// ============================================================================
// GRIOT AI — COST OPTIMISATION, RESPONSE CACHING & DEDUPLICATION ENGINE
// Supports tenant-isolated response caching, safe in-flight request deduplication,
// context reduction, and self-hosted open-weight economic break-even analysis.
// ============================================================================

import crypto from 'node:crypto';
import type {
  ChatMessageInput,
  ProviderGenerationResponse,
  ToolDefinition,
} from '../types/domain.ts';

interface CachedResponseEntry {
  response: ProviderGenerationResponse;
  expiresAtMs: number;
  hitCount: number;
}

export class CostOptimizationEngine {
  private readonly responseCache = new Map<string, CachedResponseEntry>();
  private readonly inFlightRequests = new Map<string, Promise<ProviderGenerationResponse>>();
  private readonly enabled: boolean;
  private readonly ttlMs: number;

  constructor(options: { enabled?: boolean; ttlSeconds?: number } = {}) {
    this.enabled = options.enabled ?? true;
    this.ttlMs = (options.ttlSeconds ?? 3600) * 1000;
  }

  /**
   * Computes a tenant-isolated deterministic cache/deduplication fingerprint.
   * Never shares cached responses across different organisations (`orgId` is part of the hash).
   */
  public computeCacheKey(params: {
    orgId: string;
    modelId: string;
    messages: ChatMessageInput[];
    temperature?: number;
    responseFormat?: string;
    tools?: ToolDefinition[];
  }): string | null {
    // Only cache/deduplicate deterministic or low-temperature requests without tool side-effects
    const temp = params.temperature ?? 0.2;
    if (temp > 0.3) return null;
    if (params.tools && params.tools.length > 0) return null;

    const payload = JSON.stringify({
      orgId: params.orgId,
      modelId: params.modelId,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content.trim(),
        attachments: m.attachments?.map((a) => a.fileId) || [],
      })),
      temperature: temp,
      responseFormat: params.responseFormat || 'text',
    });

    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  public getCachedResponse(
    cacheKey: string | null,
    allowOrgCaching = true
  ): ProviderGenerationResponse | null {
    if (!this.enabled || !allowOrgCaching || !cacheKey) return null;
    const entry = this.responseCache.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAtMs < Date.now()) {
      this.responseCache.delete(cacheKey);
      return null;
    }
    entry.hitCount += 1;
    return structuredClone(entry.response);
  }

  public setCachedResponse(
    cacheKey: string | null,
    response: ProviderGenerationResponse,
    allowOrgCaching = true
  ): void {
    if (!this.enabled || !allowOrgCaching || !cacheKey) return;
    if (response.finishReason !== 'stop' || !response.content) return;
    this.responseCache.set(cacheKey, {
      response: structuredClone(response),
      expiresAtMs: Date.now() + this.ttlMs,
      hitCount: 0,
    });
  }

  /**
   * Coalesces identical concurrent in-flight requests within the same tenant
   * to prevent duplicate upstream token charges.
   */
  public async executeWithDeduplication(
    cacheKey: string | null,
    executor: () => Promise<ProviderGenerationResponse>
  ): Promise<{ response: ProviderGenerationResponse; deduplicated: boolean }> {
    if (!cacheKey) {
      const response = await executor();
      return { response, deduplicated: false };
    }
    const existingPromise = this.inFlightRequests.get(cacheKey);
    if (existingPromise) {
      const shared = await existingPromise;
      return { response: structuredClone(shared), deduplicated: true };
    }

    const promise = executor().finally(() => {
      this.inFlightRequests.delete(cacheKey);
    });
    this.inFlightRequests.set(cacheKey, promise);
    const response = await promise;
    return { response, deduplicated: false };
  }

  /**
   * Evaluates whether current token volume justifies deploying a self-hosted open-weight model
   * versus continuing to route through pay-per-token cloud APIs.
   */
  public evaluateSelfHostingEconomics(params: {
    monthlyCloudSpendUsd: number;
    monthlyTokensProcessed: number;
    estimatedDedicatedGpuMonthlyCostUsd?: number;
  }): {
    recommendSelfHosting: boolean;
    monthlyCloudSpendUsd: number;
    estimatedGpuMonthlyCostUsd: number;
    projectedMonthlySavingsUsd: number;
    rationale: string;
  } {
    const gpuMonthlyCost = params.estimatedDedicatedGpuMonthlyCostUsd ?? 1450; // e.g. 2x L40S / A100 reserved instance
    const savings = Number((params.monthlyCloudSpendUsd - gpuMonthlyCost).toFixed(2));
    const recommend = params.monthlyCloudSpendUsd > gpuMonthlyCost * 1.35;

    return {
      recommendSelfHosting: recommend,
      monthlyCloudSpendUsd: params.monthlyCloudSpendUsd,
      estimatedGpuMonthlyCostUsd: gpuMonthlyCost,
      projectedMonthlySavingsUsd: Math.max(0, savings),
      rationale: recommend
        ? `Monthly cloud spend ($${params.monthlyCloudSpendUsd.toFixed(2)}) exceeds self-hosted GPU break-even threshold ($${(gpuMonthlyCost * 1.35).toFixed(2)}). Activate open_weight adapter endpoint.`
        : `Monthly cloud spend ($${params.monthlyCloudSpendUsd.toFixed(2)}) is below self-hosted GPU break-even ($${(gpuMonthlyCost * 1.35).toFixed(2)}). Avoid premature self-hosting; continue cloud API routing.`,
    };
  }
}
