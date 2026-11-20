// ============================================================================
// GRIOT AI — ADMINISTRATION, OBSERVABILITY & PRIVACY-PRESERVING SUPPORT
// Provides operational metrics (provider health, model availability, request
// volume, tokens, actual vs estimated costs, error rates, latency p50/p95/p99,
// org usage, API activity, budget consumption).
// Redacts private user conversation content from administrators by default,
// requiring audited break-glass support authorization for security investigations.
// ============================================================================

import type { GriotDatabase } from '../db/database.ts';
import type { ProviderManager } from '../providers/providerManager.ts';
import type { ModelRegistryService } from '../registry/modelRegistry.ts';
import type { AuditAndRetentionService } from '../security/auditAndRetention.ts';
import { AuthError } from '../security/auth.ts';
import type { AuthContext } from '../types/domain.ts';

export class ObservabilityAndAdminService {
  private readonly database: GriotDatabase;
  private readonly registry: ModelRegistryService;
  private readonly providerManager: ProviderManager;
  private readonly audit: AuditAndRetentionService;

  constructor(params: {
    database: GriotDatabase;
    registry: ModelRegistryService;
    providerManager: ProviderManager;
    audit: AuditAndRetentionService;
  }) {
    this.database = params.database;
    this.registry = params.registry;
    this.providerManager = params.providerManager;
    this.audit = params.audit;
  }

  public getSystemObservabilityReport(auth: AuthContext): {
    generatedAt: string;
    orgId: string;
    providerStatus: ReturnType<ProviderManager['getProviderStatuses']>;
    modelAvailability: Array<{
      id: string;
      provider: string;
      displayName: string;
      availability: string;
      routingEligible: boolean;
    }>;
    trafficAndTokens: {
      totalRequests: number;
      completedRequests: number;
      failedRequests: number;
      interruptedRequests: number;
      cachedRequests: number;
      errorRatePercent: number;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
    };
    costsAndBudgets: {
      actualProviderCostUsd: number;
      estimatedCostUsd: number;
      billableCostUsd: number;
      monthlyBudgetLimitUsd: number | null;
      budgetConsumedPercent: number | null;
      remainingTotalCreditsUsd: number;
    };
    latencyMetrics: {
      avgMs: number;
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
    };
    apiActivity: Array<{
      apiKeyId: string;
      name: string;
      keyPrefix: string;
      requestCount: number;
      totalSpendUsd: number;
      lastUsedAt: string | null;
    }>;
    recentConversationsMetadata: Array<{
      conversationId: string;
      userId: string;
      title: string;
      status: string;
      messageCount: number;
      contentPreview: string;
      updatedAt: string;
    }>;
  } {
    if (!auth.scopes.includes('admin:observability')) {
      throw new AuthError(
        'Access denied: requires admin:observability permission scope.',
        403,
        'FORBIDDEN_SCOPE'
      );
    }

    const ledgerRows = this.database.db
      .prepare(`SELECT * FROM usage_ledger WHERE org_id = ? ORDER BY created_at DESC`)
      .all(auth.orgId) as Array<Record<string, unknown>>;

    let completed = 0;
    let failed = 0;
    let interrupted = 0;
    let cached = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let actualCost = 0;
    let estimatedCost = 0;
    let billableCost = 0;
    const durations: number[] = [];

    for (const r of ledgerRows) {
      const status = String(r.status);
      if (status === 'completed' || status === 'streamed') completed++;
      else if (status === 'failed') failed++;
      else if (status === 'interrupted') interrupted++;
      else if (status === 'cached') cached++;

      inputTokens += Number(r.input_tokens || 0);
      outputTokens += Number(r.output_tokens || 0);
      cachedTokens += Number(r.cached_tokens || 0);

      const est = Number(r.estimated_cost_usd || 0);
      const bill = Number(r.billable_cost_usd || 0);
      const act =
        r.actual_provider_cost_usd !== null && r.actual_provider_cost_usd !== undefined
          ? Number(r.actual_provider_cost_usd)
          : est;

      actualCost += act;
      estimatedCost += est;
      billableCost += bill;
      durations.push(Number(r.duration_ms || 0));
    }

    durations.sort((a, b) => a - b);
    const percentile = (p: number): number => {
      if (durations.length === 0) return 0;
      const idx = Math.min(
        durations.length - 1,
        Math.floor((p / 100) * durations.length)
      );
      return durations[idx];
    };
    const avgMs =
      durations.length > 0
        ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
        : 0;

    const billingRow = this.database.db
      .prepare(`SELECT * FROM billing_accounts WHERE org_id = ?`)
      .get(auth.orgId) as Record<string, unknown> | undefined;

    const monthlyLimit =
      billingRow &&
      billingRow.monthly_budget_limit_usd !== null &&
      billingRow.monthly_budget_limit_usd !== undefined
        ? Number(billingRow.monthly_budget_limit_usd)
        : null;

    const remainingCredits = billingRow
      ? Number(billingRow.free_credits_usd || 0) +
        Number(billingRow.subscription_allowance_usd || 0) +
        Number(billingRow.prepaid_credits_usd || 0) +
        Number(billingRow.enterprise_allocation_usd || 0) +
        Number(billingRow.promotional_credits_usd || 0)
      : 0;

    const apiActivityRows = this.database.db
      .prepare(
        `SELECT ak.id, ak.name, ak.key_prefix, ak.last_used_at,
                COUNT(ul.id) AS req_count,
                COALESCE(SUM(ul.billable_cost_usd), 0) AS spend_usd
         FROM api_credentials ak
         LEFT JOIN usage_ledger ul ON ul.api_key_id = ak.id
         WHERE ak.org_id = ?
         GROUP BY ak.id
         ORDER BY req_count DESC`
      )
      .all(auth.orgId) as Array<Record<string, unknown>>;

    // Note: Private user conversations are NEVER exposed to administrators by default!
    const convRows = this.database.db
      .prepare(
        `SELECT c.id, c.user_id, c.title, c.status, c.updated_at,
                COUNT(m.id) AS msg_count
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.org_id = ?
         GROUP BY c.id
         ORDER BY c.updated_at DESC
         LIMIT 25`
      )
      .all(auth.orgId) as Array<Record<string, unknown>>;

    return {
      generatedAt: new Date().toISOString(),
      orgId: auth.orgId,
      providerStatus: this.providerManager.getProviderStatuses(auth.orgId),
      modelAvailability: this.registry.listModels().map((m) => ({
        id: m.id,
        provider: m.provider,
        displayName: m.displayName,
        availability: m.availability,
        routingEligible: m.routingEligibility.eligible,
      })),
      trafficAndTokens: {
        totalRequests: ledgerRows.length,
        completedRequests: completed,
        failedRequests: failed,
        interruptedRequests: interrupted,
        cachedRequests: cached,
        errorRatePercent:
          ledgerRows.length > 0
            ? Number(((failed / ledgerRows.length) * 100).toFixed(2))
            : 0,
        inputTokens,
        outputTokens,
        cachedTokens,
      },
      costsAndBudgets: {
        actualProviderCostUsd: Number(actualCost.toFixed(8)),
        estimatedCostUsd: Number(estimatedCost.toFixed(8)),
        billableCostUsd: Number(billableCost.toFixed(8)),
        monthlyBudgetLimitUsd: monthlyLimit,
        budgetConsumedPercent:
          monthlyLimit && monthlyLimit > 0
            ? Number(((billableCost / monthlyLimit) * 100).toFixed(2))
            : null,
        remainingTotalCreditsUsd: Number(remainingCredits.toFixed(8)),
      },
      latencyMetrics: {
        avgMs,
        p50Ms: percentile(50),
        p95Ms: percentile(95),
        p99Ms: percentile(99),
      },
      apiActivity: apiActivityRows.map((a) => ({
        apiKeyId: String(a.id),
        name: String(a.name),
        keyPrefix: String(a.key_prefix),
        requestCount: Number(a.req_count || 0),
        totalSpendUsd: Number(Number(a.spend_usd || 0).toFixed(8)),
        lastUsedAt: a.last_used_at ? String(a.last_used_at) : null,
      })),
      recentConversationsMetadata: convRows.map((c) => ({
        conversationId: String(c.id),
        userId: String(c.user_id),
        title: '[REDACTED_BY_DEFAULT_PRIVACY_POLICY]',
        status: String(c.status),
        messageCount: Number(c.msg_count || 0),
        contentPreview: '[REDACTED_PRIVATE_USER_CONVERSATION]',
        updatedAt: String(c.updated_at),
      })),
    };
  }

  /**
   * Restricted break-glass access for authorised support and security investigations.
   * Requires the `admin:support_investigate` permission scope, a valid ticket ID,
   * and an explicit investigation reason, and records an immutable audit log entry.
   */
  public investigateConversationForSupport(params: {
    auth: AuthContext;
    conversationId: string;
    ticketId: string;
    reason: string;
  }): {
    investigationAuditId: string;
    conversationId: string;
    orgId: string;
    userId: string;
    title: string;
    messages: Array<{
      id: string;
      sequenceNum: number;
      role: string;
      content: string;
      modelId: string | null;
      status: string;
      createdAt: string;
    }>;
  } {
    if (!params.auth.scopes.includes('admin:support_investigate')) {
      this.audit.record({
        orgId: params.auth.orgId,
        actorUserId: params.auth.userId,
        action: 'support.break_glass_denied',
        resourceType: 'conversation',
        resourceId: params.conversationId,
        outcome: 'denied',
        details: { ticketId: params.ticketId },
      });
      throw new AuthError(
        'Break-glass investigation denied: requires admin:support_investigate scope (support_auditor role).',
        403,
        'SUPPORT_INVESTIGATION_FORBIDDEN'
      );
    }

    if (!params.ticketId || params.ticketId.trim().length < 3) {
      throw new Error('Support investigation requires a valid ticketId.');
    }
    if (!params.reason || params.reason.trim().length < 12) {
      throw new Error(
        'Support investigation requires a detailed justification reason (min 12 characters).'
      );
    }

    const convRow = this.database.db
      .prepare(`SELECT * FROM conversations WHERE id = ? AND org_id = ?`)
      .get(params.conversationId, params.auth.orgId) as Record<string, unknown> | undefined;

    if (!convRow) {
      throw new Error(
        `Conversation '${params.conversationId}' not found in organisation '${params.auth.orgId}'.`
      );
    }

    const msgRows = this.database.db
      .prepare(
        `SELECT id, sequence_num, role, content, model_id, status, created_at
         FROM messages
         WHERE conversation_id = ? AND org_id = ?
         ORDER BY sequence_num ASC`
      )
      .all(params.conversationId, params.auth.orgId) as Array<Record<string, unknown>>;

    const auditRecord = this.audit.record({
      orgId: params.auth.orgId,
      actorUserId: params.auth.userId,
      action: 'support.break_glass_conversation_inspected',
      resourceType: 'conversation',
      resourceId: params.conversationId,
      outcome: 'success',
      ipAddress: params.auth.ipAddress,
      details: {
        ticketId: params.ticketId.trim(),
        reason: params.reason.trim(),
        targetUserId: String(convRow.user_id),
        messageCount: msgRows.length,
      },
    });

    return {
      investigationAuditId: auditRecord.id,
      conversationId: String(convRow.id),
      orgId: String(convRow.org_id),
      userId: String(convRow.user_id),
      title: String(convRow.title),
      messages: msgRows.map((m) => ({
        id: String(m.id),
        sequenceNum: Number(m.sequence_num),
        role: String(m.role),
        content: String(m.content),
        modelId: m.model_id ? String(m.model_id) : null,
        status: String(m.status),
        createdAt: String(m.created_at),
      })),
    };
  }
}
