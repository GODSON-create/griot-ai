// ============================================================================
// GRIOT AI — V1 LOCAL INFERENCE CONCURRENCY, QUEUE & INTERNAL COST ALLOCATION
// Controls concurrent local inference requests, queue depth limits, queue wait
// timeouts, and administrator-configurable internal infrastructure cost rates
// (never inventing fake GPU or CPU costs).
// ============================================================================

export class LocalQueueLimitError extends Error {
  public readonly statusCode = 429;
  public readonly code = 'LOCAL_INFERENCE_QUEUE_LIMIT_EXCEEDED';

  constructor(message: string) {
    super(message);
    this.name = 'LocalQueueLimitError';
  }
}

export interface InternalInfrastructureCostRates {
  internalCostPer1MInputTokensUsd: number;
  internalCostPer1MOutputTokensUsd: number;
  internalCostPerComputeSecondUsd: number;
}

export class LocalInferenceConcurrencyController {
  private activeCount = 0;
  private readonly waitQueue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private maxConcurrent: number;
  private maxQueueDepth: number;
  private queueTimeoutMs: number;
  private internalRates: InternalInfrastructureCostRates;

  constructor(options?: {
    maxConcurrent?: number;
    maxQueueDepth?: number;
    queueTimeoutMs?: number;
    internalRates?: Partial<InternalInfrastructureCostRates>;
  }) {
    this.maxConcurrent = Math.max(1, options?.maxConcurrent ?? 2);
    this.maxQueueDepth = Math.max(0, options?.maxQueueDepth ?? 15);
    this.queueTimeoutMs = Math.max(100, options?.queueTimeoutMs ?? 30000);
    // Default to 0.00 so GPU/CPU costs are never invented unless configured by an admin
    this.internalRates = {
      internalCostPer1MInputTokensUsd:
        options?.internalRates?.internalCostPer1MInputTokensUsd ?? 0,
      internalCostPer1MOutputTokensUsd:
        options?.internalRates?.internalCostPer1MOutputTokensUsd ?? 0,
      internalCostPerComputeSecondUsd:
        options?.internalRates?.internalCostPerComputeSecondUsd ?? 0,
    };
  }

  public configureInternalRates(
    rates: Partial<InternalInfrastructureCostRates>
  ): InternalInfrastructureCostRates {
    this.internalRates = {
      ...this.internalRates,
      ...rates,
    };
    return { ...this.internalRates };
  }

  public getInternalRates(): InternalInfrastructureCostRates {
    return { ...this.internalRates };
  }

  public calculateInternalInfrastructureAllocation(params: {
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  }): number {
    const inCost =
      (Math.max(0, params.inputTokens) / 1_000_000) *
      this.internalRates.internalCostPer1MInputTokensUsd;
    const outCost =
      (Math.max(0, params.outputTokens) / 1_000_000) *
      this.internalRates.internalCostPer1MOutputTokensUsd;
    const computeCost =
      (Math.max(0, params.durationMs) / 1000) *
      this.internalRates.internalCostPerComputeSecondUsd;
    return Number((inCost + outCost + computeCost).toFixed(8));
  }

  public async acquireSlot(): Promise<() => void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.releaseSlot();
      };
    }

    if (this.waitQueue.length >= this.maxQueueDepth) {
      throw new LocalQueueLimitError(
        `Local inference queue limit reached (active=${this.activeCount}, queued=${this.waitQueue.length}, maxQueueDepth=${this.maxQueueDepth}).`
      );
    }

    return new Promise<() => void>((resolve, reject) => {
      const entry = {
        resolve: () => {
          clearTimeout(entry.timer);
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            this.releaseSlot();
          });
        },
        reject: (err: Error) => {
          clearTimeout(entry.timer);
          reject(err);
        },
        timer: setTimeout(() => {
          const idx = this.waitQueue.indexOf(entry);
          if (idx !== -1) {
            this.waitQueue.splice(idx, 1);
          }
          reject(
            new LocalQueueLimitError(
              `Timed out waiting in local inference queue after ${this.queueTimeoutMs}ms.`
            )
          );
        }, this.queueTimeoutMs),
      };
      this.waitQueue.push(entry);
    });
  }

  private releaseSlot(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next.resolve();
    } else {
      this.activeCount = Math.max(0, this.activeCount - 1);
    }
  }

  public getQueueMetrics(): {
    activeRequests: number;
    queuedRequests: number;
    maxConcurrent: number;
    maxQueueDepth: number;
  } {
    return {
      activeRequests: this.activeCount,
      queuedRequests: this.waitQueue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueueDepth: this.maxQueueDepth,
    };
  }
}
