// ============================================================================
// GRIOT AI — RATE LIMITING & USAGE ABUSE PROTECTION ENGINE
// Enforces sliding-window rate limits per User, Organisation, API Key, and IP.
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  limitRpm: number;
  remaining: number;
  resetAtUnixMs: number;
  retryAfterSeconds: number;
  scopeBlocked?: 'api_key' | 'user' | 'organisation' | 'ip' | 'abuse_lockout';
}

export class RateLimiter {
  private readonly windows = new Map<string, number[]>();
  private readonly abuseViolations = new Map<string, { count: number; lockedUntilMs: number }>();
  private readonly defaultRpm: number;

  constructor(defaultRpm = 120) {
    this.defaultRpm = defaultRpm;
  }

  public checkAndConsume(params: {
    userId: string;
    orgId: string;
    apiKeyId?: string | null;
    ipAddress?: string;
    customRpm?: number;
    nowMs?: number;
  }): RateLimitResult {
    const now = params.nowMs ?? Date.now();
    const actorKey = params.apiKeyId ? `apikey:${params.apiKeyId}` : `user:${params.userId}`;

    // 1. Check abuse lockout
    const abuse = this.abuseViolations.get(actorKey);
    if (abuse && abuse.lockedUntilMs > now) {
      return {
        allowed: false,
        limitRpm: params.customRpm ?? this.defaultRpm,
        remaining: 0,
        resetAtUnixMs: abuse.lockedUntilMs,
        retryAfterSeconds: Math.max(1, Math.ceil((abuse.lockedUntilMs - now) / 1000)),
        scopeBlocked: 'abuse_lockout',
      };
    }

    const rpm = params.customRpm ?? this.defaultRpm;
    const checks: Array<{ key: string; limit: number; scope: RateLimitResult['scopeBlocked'] }> = [
      { key: actorKey, limit: rpm, scope: params.apiKeyId ? 'api_key' : 'user' },
      { key: `org:${params.orgId}`, limit: Math.max(rpm * 5, 300), scope: 'organisation' },
    ];
    if (params.ipAddress) {
      checks.push({ key: `ip:${params.ipAddress}`, limit: Math.max(rpm * 3, 180), scope: 'ip' });
    }

    const windowDurationMs = 60_000;
    const windowStart = now - windowDurationMs;

    for (const check of checks) {
      const timestamps = (this.windows.get(check.key) || []).filter((ts) => ts > windowStart);
      if (timestamps.length >= check.limit) {
        this.windows.set(check.key, timestamps);
        this.recordViolation(actorKey, now);
        const oldest = timestamps[0] ?? now;
        const resetAtUnixMs = oldest + windowDurationMs;
        return {
          allowed: false,
          limitRpm: check.limit,
          remaining: 0,
          resetAtUnixMs,
          retryAfterSeconds: Math.max(1, Math.ceil((resetAtUnixMs - now) / 1000)),
          scopeBlocked: check.scope,
        };
      }
    }

    // Consume slot across all scopes
    let primaryRemaining = rpm;
    let primaryReset = now + windowDurationMs;
    for (const check of checks) {
      const timestamps = (this.windows.get(check.key) || []).filter((ts) => ts > windowStart);
      timestamps.push(now);
      this.windows.set(check.key, timestamps);
      if (check.key === actorKey) {
        primaryRemaining = Math.max(0, check.limit - timestamps.length);
        primaryReset = (timestamps[0] ?? now) + windowDurationMs;
      }
    }

    return {
      allowed: true,
      limitRpm: rpm,
      remaining: primaryRemaining,
      resetAtUnixMs: primaryReset,
      retryAfterSeconds: 0,
    };
  }

  private recordViolation(actorKey: string, nowMs: number): void {
    const current = this.abuseViolations.get(actorKey) || { count: 0, lockedUntilMs: 0 };
    current.count += 1;
    // If an actor triggers rate limit violations >= 15 times, impose a temporary 5-minute abuse cooldown
    if (current.count >= 15) {
      current.lockedUntilMs = nowMs + 5 * 60_000;
      current.count = 0;
    }
    this.abuseViolations.set(actorKey, current);
  }

  public reset(): void {
    this.windows.clear();
    this.abuseViolations.clear();
  }
}
