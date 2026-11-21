// ============================================================================
// GRIOT AI — SERVER-SIDE USAGE LEDGER & ECONOMICS ENGINE
// Implements Locked Business Decisions:
// - AVANTAGE GROUP ('avantage_free'): Free access through authorised org accounts
//   (never blocked by credit exhaustion; tracks full provider cost & allocation).
// - PUBLIC USERS ('public_freemium'): Freemium access with configurable free
//   allowances and paid usage tiers.
// - ENTERPRISE ('enterprise_contract'): Shared infrastructure with strict tenant
//   isolation, organisation-specific usage accounting, budgets & allocations.
// ============================================================================

import type { GriotDatabase } from '../db/database.ts';
import { generateId } from '../security/crypto.ts';
import type {
  AccessModelType,
  CreditBreakdown,
  ExecutionMode,
  GriotProductModuleId,
  ModelRegistryEntry,
  ProviderUsageMetrics,
  TaskClassification,
  UsageLedgerRecord,
} from '../types/domain.ts';

export class BudgetExceededError extends Error {
  public readonly statusCode = 402;
  public readonly code = 'BUDGET_OR_CREDIT_LIMIT_EXCEEDED';
  public readonly scope: 'user' | 'organisation' | 'api_key' | 'insufficient_credits';

  constructor(
    message: string,
    scope: 'user' | 'organisation' | 'api_key' | 'insufficient_credits'
  ) {
    super(message);
    this.name = 'BudgetExceededError';
    this.scope = scope;
  }
}

export interface BillingAccountState {
  id: string;
  orgId: string;
  accessModel: AccessModelType;
  isAvantageFreeAccess: boolean;
  currency: string;
  freeCreditsUsd: number;
  subscriptionAllowanceUsd: number;
  prepaidCreditsUsd: number;
  enterpriseAllocationUsd: number;
  promotionalCreditsUsd: number;
  totalAvailableCreditsUsd: number;
  monthlyBudgetLimitUsd: number | null;
  alertThresholdPercent: number;
  status: string;
  updatedAt: string;
}

export class UsageAndEconomicsEngine {
  private readonly database: GriotDatabase;

  constructor(database: GriotDatabase) {
    this.database = database;
  }

  public getBillingAccount(orgId: string): BillingAccountState {
    const row = this.database.db
      .prepare(
        `SELECT b.*, o.access_model, o.is_avantage_internal
         FROM billing_accounts b
         JOIN organisations o ON o.id = b.org_id
         WHERE b.org_id = ?`
      )
      .get(orgId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Billing account not found for organisation '${orgId}'`);
    }

    const freeCreditsUsd = Number(row.free_credits_usd || 0);
    const subscriptionAllowanceUsd = Number(row.subscription_allowance_usd || 0);
    const prepaidCreditsUsd = Number(row.prepaid_credits_usd || 0);
    const enterpriseAllocationUsd = Number(row.enterprise_allocation_usd || 0);
    const promotionalCreditsUsd = Number(row.promotional_credits_usd || 0);
    const accessModel = String(
      row.access_model || (row.is_avantage_internal ? 'avantage_free' : 'public_freemium')
    ) as AccessModelType;
    const isAvantageFreeAccess =
      Boolean(row.is_avantage_internal) || accessModel === 'avantage_free';

    return {
      id: String(row.id),
      orgId: String(row.org_id),
      accessModel,
      isAvantageFreeAccess,
      currency: String(row.currency),
      freeCreditsUsd,
      subscriptionAllowanceUsd,
      prepaidCreditsUsd,
      enterpriseAllocationUsd,
      promotionalCreditsUsd,
      totalAvailableCreditsUsd: Number(
        (
          freeCreditsUsd +
          subscriptionAllowanceUsd +
          prepaidCreditsUsd +
          enterpriseAllocationUsd +
          promotionalCreditsUsd
        ).toFixed(8)
      ),
      monthlyBudgetLimitUsd:
        row.monthly_budget_limit_usd !== null && row.monthly_budget_limit_usd !== undefined
          ? Number(row.monthly_budget_limit_usd)
          : null,
      alertThresholdPercent: Number(row.alert_threshold_percent || 80),
      status: String(row.status),
      updatedAt: String(row.updated_at),
    };
  }

  public updateBillingAccount(params: {
    orgId: string;
    freeCreditsUsd?: number;
    subscriptionAllowanceUsd?: number;
    prepaidCreditsUsd?: number;
    enterpriseAllocationUsd?: number;
    promotionalCreditsUsd?: number;
    monthlyBudgetLimitUsd?: number | null;
    alertThresholdPercent?: number;
  }): BillingAccountState {
    const current = this.getBillingAccount(params.orgId);
    const updatedAt = new Date().toISOString();

    this.database.db
      .prepare(
        `UPDATE billing_accounts
         SET free_credits_usd = ?,
             subscription_allowance_usd = ?,
             prepaid_credits_usd = ?,
             enterprise_allocation_usd = ?,
             promotional_credits_usd = ?,
             monthly_budget_limit_usd = ?,
             alert_threshold_percent = ?,
             updated_at = ?
         WHERE org_id = ?`
      )
      .run(
        params.freeCreditsUsd ?? current.freeCreditsUsd,
        params.subscriptionAllowanceUsd ?? current.subscriptionAllowanceUsd,
        params.prepaidCreditsUsd ?? current.prepaidCreditsUsd,
        params.enterpriseAllocationUsd ?? current.enterpriseAllocationUsd,
        params.promotionalCreditsUsd ?? current.promotionalCreditsUsd,
        params.monthlyBudgetLimitUsd !== undefined
          ? params.monthlyBudgetLimitUsd
          : current.monthlyBudgetLimitUsd,
        params.alertThresholdPercent ?? current.alertThresholdPercent,
        updatedAt,
        params.orgId
      );

    return this.getBillingAccount(params.orgId);
  }

  public calculateModelCost(params: {
    model: ModelRegistryEntry;
    usage: ProviderUsageMetrics;
    cacheHit?: boolean;
  }): {
    actualProviderCostUsd: number | null;
    estimatedCostUsd: number;
    billableCostUsd: number;
    costSource: 'actual_provider' | 'registry_pricing' | 'cached_zero';
  } {
    if (params.cacheHit) {
      return {
        actualProviderCostUsd: 0,
        estimatedCostUsd: 0,
        billableCostUsd: 0,
        costSource: 'cached_zero',
      };
    }

    const inputRate = params.model.inputPricingPer1M ?? 0;
    const cachedRate = params.model.cachedInputPricingPer1M ?? inputRate;
    const outputRate = params.model.outputPricingPer1M ?? 0;

    const totalInput = Math.max(0, params.usage.inputTokens);
    const cachedInput = Math.min(totalInput, Math.max(0, params.usage.cachedInputTokens));
    const uncachedInput = totalInput - cachedInput;
    const outputTokens = Math.max(0, params.usage.outputTokens);

    const estimatedCostUsd = Number(
      (
        (uncachedInput / 1_000_000) * inputRate +
        (cachedInput / 1_000_000) * cachedRate +
        (outputTokens / 1_000_000) * outputRate
      ).toFixed(8)
    );

    const hasActualCost =
      typeof params.usage.actualProviderCostUsd === 'number' &&
      !Number.isNaN(params.usage.actualProviderCostUsd) &&
      params.usage.actualProviderCostUsd >= 0;

    const actualProviderCostUsd = hasActualCost
      ? Number(params.usage.actualProviderCostUsd!.toFixed(8))
      : null;

    const billableCostUsd =
      actualProviderCostUsd !== null ? actualProviderCostUsd : estimatedCostUsd;
    const costSource =
      actualProviderCostUsd !== null ? 'actual_provider' : 'registry_pricing';

    return {
      actualProviderCostUsd,
      estimatedCostUsd,
      billableCostUsd,
      costSource,
    };
  }

  /**
   * Enforces User, Organisation, and API-Key spending limits and credit balance
   * BEFORE executing a model request to prevent runaway model costs.
   * Note: Authorised Avantage Group organisations ('avantage_free') have FREE access
   * and are never blocked by credit depletion, while still respecting explicit
   * user/key/monthly governance ceilings if configured.
   */
  public assertWithinSpendingLimits(params: {
    orgId: string;
    userId: string;
    apiKeyId?: string | null;
    estimatedRequestCostUsd?: number;
  }): void {
    const projectedDelta = Math.max(0.000001, params.estimatedRequestCostUsd || 0.00001);
    const billing = this.getBillingAccount(params.orgId);

    if (billing.status !== 'active') {
      throw new BudgetExceededError(
        `Organisation billing account is ${billing.status}.`,
        'organisation'
      );
    }

    // 1. Check total available credits across all 5 buckets (exempt for Avantage Group FREE access)
    if (
      !billing.isAvantageFreeAccess &&
      (billing.totalAvailableCreditsUsd <= 0 ||
        billing.totalAvailableCreditsUsd < projectedDelta)
    ) {
      throw new BudgetExceededError(
        `Insufficient credits: available balance ($${billing.totalAvailableCreditsUsd.toFixed(6)}) cannot cover projected request cost ($${projectedDelta.toFixed(6)}).`,
        'insufficient_credits'
      );
    }

    // 2. Check Organisation monthly budget limit
    if (billing.monthlyBudgetLimitUsd !== null) {
      const orgSpendRow = this.database.db
        .prepare(
          `SELECT COALESCE(SUM(billable_cost_usd), 0) AS total_spend
           FROM usage_ledger
           WHERE org_id = ?`
        )
        .get(params.orgId) as { total_spend: number };
      const orgSpend = Number(orgSpendRow.total_spend || 0);
      if (orgSpend + projectedDelta > billing.monthlyBudgetLimitUsd) {
        throw new BudgetExceededError(
          `Organisation spending limit reached ($${orgSpend.toFixed(4)} / $${billing.monthlyBudgetLimitUsd.toFixed(4)}).`,
          'organisation'
        );
      }
    }

    // 3. Check User spending limit
    const userRow = this.database.db
      .prepare(
        `SELECT u.spending_limit_usd AS user_limit, m.spending_limit_usd AS member_limit
         FROM users u
         LEFT JOIN organisation_members m ON m.user_id = u.id AND m.org_id = ?
         WHERE u.id = ?`
      )
      .get(params.orgId, params.userId) as
      | { user_limit: number | null; member_limit: number | null }
      | undefined;

    const effectiveUserLimit =
      userRow?.member_limit !== null && userRow?.member_limit !== undefined
        ? Number(userRow.member_limit)
        : userRow?.user_limit !== null && userRow?.user_limit !== undefined
          ? Number(userRow.user_limit)
          : null;

    if (effectiveUserLimit !== null) {
      const userSpendRow = this.database.db
        .prepare(
          `SELECT COALESCE(SUM(billable_cost_usd), 0) AS total_spend
           FROM usage_ledger
           WHERE org_id = ? AND user_id = ?`
        )
        .get(params.orgId, params.userId) as { total_spend: number };
      const userSpend = Number(userSpendRow.total_spend || 0);
      if (userSpend + projectedDelta > effectiveUserLimit) {
        throw new BudgetExceededError(
          `User spending limit reached ($${userSpend.toFixed(4)} / $${effectiveUserLimit.toFixed(4)}).`,
          'user'
        );
      }
    }

    // 4. Check API-Key spending limit
    if (params.apiKeyId) {
      const keyRow = this.database.db
        .prepare(`SELECT spending_limit_usd FROM api_credentials WHERE id = ?`)
        .get(params.apiKeyId) as { spending_limit_usd: number | null } | undefined;

      if (
        keyRow &&
        keyRow.spending_limit_usd !== null &&
        keyRow.spending_limit_usd !== undefined
      ) {
        const keyLimit = Number(keyRow.spending_limit_usd);
        const keySpendRow = this.database.db
          .prepare(
            `SELECT COALESCE(SUM(billable_cost_usd), 0) AS total_spend
             FROM usage_ledger
             WHERE api_key_id = ?`
          )
          .get(params.apiKeyId) as { total_spend: number };
        const keySpend = Number(keySpendRow.total_spend || 0);
        if (keySpend + projectedDelta > keyLimit) {
          throw new BudgetExceededError(
            `API key spending limit reached ($${keySpend.toFixed(4)} / $${keyLimit.toFixed(4)}).`,
            'api_key'
          );
        }
      }
    }
  }

  public recordUsage(params: {
    requestId: string;
    orgId: string;
    workspaceId?: string | null;
    userId: string;
    apiKeyId?: string | null;
    conversationId?: string | null;
    messageId?: string | null;
    featureModule?: GriotProductModuleId;
    endpointPath?: string;
    executionMode?: ExecutionMode;
    model: ModelRegistryEntry;
    taskType: TaskClassification;
    usage: ProviderUsageMetrics;
    durationMs: number;
    status: UsageLedgerRecord['status'];
    cacheHit?: boolean;
    fallbackUsed?: boolean;
  }): UsageLedgerRecord {
    const costCalc = this.calculateModelCost({
      model: params.model,
      usage: params.usage,
      cacheHit: params.cacheHit,
    });

    return this.database.transaction(() => {
      const billing = this.getBillingAccount(params.orgId);
      let remainingToDeduct = costCalc.billableCostUsd;

      const take = (available: number): [number, number] => {
        if (remainingToDeduct <= 0 || available <= 0) return [0, available];
        const consumed = Math.min(available, remainingToDeduct);
        remainingToDeduct = Number((remainingToDeduct - consumed).toFixed(8));
        const nextAvail = Number((available - consumed).toFixed(8));
        return [Number(consumed.toFixed(8)), nextAvail];
      };

      const [promotionalUsd, nextPromo] = take(billing.promotionalCreditsUsd);
      const [freeUsd, nextFree] = take(billing.freeCreditsUsd);
      const [subscriptionUsd, nextSub] = take(billing.subscriptionAllowanceUsd);
      const [enterpriseUsd, nextEnt] = take(billing.enterpriseAllocationUsd);
      const [prepaidUsd, nextPrepaid] = take(billing.prepaidCreditsUsd);

      const breakdown: CreditBreakdown = {
        promotionalUsd,
        freeUsd,
        subscriptionUsd,
        enterpriseUsd,
        prepaidUsd,
      };

      // Determine applicable subscription or allocation label
      let applicableAllocation: string = billing.accessModel;
      if (billing.isAvantageFreeAccess) {
        applicableAllocation = 'avantage_internal_free';
      } else if (enterpriseUsd > 0) {
        applicableAllocation = 'enterprise_allocation';
      } else if (subscriptionUsd > 0) {
        applicableAllocation = 'subscription_allowance';
      } else if (prepaidUsd > 0) {
        applicableAllocation = 'prepaid_credits';
      } else if (promotionalUsd > 0) {
        applicableAllocation = 'promotional_credits';
      } else if (freeUsd > 0) {
        applicableAllocation = 'freemium_allowance';
      }

      const featureModule: GriotProductModuleId = params.featureModule ?? 'griot_chat';
      const endpointPath = params.endpointPath ?? '/api/v1/chat/completions';
      const executionMode: ExecutionMode = params.executionMode ?? 'live';
      const nowIso = new Date().toISOString();

      this.database.db
        .prepare(
          `UPDATE billing_accounts
           SET promotional_credits_usd = ?,
               free_credits_usd = ?,
               subscription_allowance_usd = ?,
               enterprise_allocation_usd = ?,
               prepaid_credits_usd = ?,
               updated_at = ?
           WHERE org_id = ?`
        )
        .run(nextPromo, nextFree, nextSub, nextEnt, nextPrepaid, nowIso, params.orgId);

      const id = generateId('ulg');
      this.database.db
        .prepare(
          `INSERT INTO usage_ledger (
            id, request_id, org_id, workspace_id, user_id, api_key_id,
            conversation_id, message_id, feature_module, endpoint_path,
            applicable_allocation, execution_mode, provider, model_id, task_type,
            input_tokens, output_tokens, cached_tokens, duration_ms, status,
            actual_provider_cost_usd, estimated_cost_usd, billable_cost_usd,
            cost_source, credits_breakdown_json, cache_hit, fallback_used, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          params.requestId,
          params.orgId,
          params.workspaceId ?? null,
          params.userId,
          params.apiKeyId ?? null,
          params.conversationId ?? null,
          params.messageId ?? null,
          featureModule,
          endpointPath,
          applicableAllocation,
          executionMode,
          params.model.provider,
          params.model.id,
          params.taskType,
          params.usage.inputTokens,
          params.usage.outputTokens,
          params.usage.cachedInputTokens,
          params.durationMs,
          params.status,
          costCalc.actualProviderCostUsd,
          costCalc.estimatedCostUsd,
          costCalc.billableCostUsd,
          costCalc.costSource,
          JSON.stringify(breakdown),
          params.cacheHit ? 1 : 0,
          params.fallbackUsed ? 1 : 0,
          nowIso
        );

      this.evaluateBudgetAlerts(params.orgId, billing);

      return {
        id,
        requestId: params.requestId,
        orgId: params.orgId,
        workspaceId: params.workspaceId ?? null,
        userId: params.userId,
        apiKeyId: params.apiKeyId ?? null,
        conversationId: params.conversationId ?? null,
        messageId: params.messageId ?? null,
        featureModule,
        endpointPath,
        applicableAllocation,
        executionMode,
        provider: params.model.provider,
        modelId: params.model.id,
        taskType: params.taskType,
        inputTokens: params.usage.inputTokens,
        outputTokens: params.usage.outputTokens,
        cachedTokens: params.usage.cachedInputTokens,
        durationMs: params.durationMs,
        status: params.status,
        actualProviderCostUsd: costCalc.actualProviderCostUsd,
        estimatedCostUsd: costCalc.estimatedCostUsd,
        billableCostUsd: costCalc.billableCostUsd,
        costSource: costCalc.costSource,
        creditsBreakdown: breakdown,
        cacheHit: Boolean(params.cacheHit),
        fallbackUsed: Boolean(params.fallbackUsed),
        createdAt: nowIso,
      };
    });
  }

  private evaluateBudgetAlerts(orgId: string, billing: BillingAccountState): void {
    if (billing.monthlyBudgetLimitUsd === null || billing.monthlyBudgetLimitUsd <= 0) {
      return;
    }
    const spendRow = this.database.db
      .prepare(
        `SELECT COALESCE(SUM(billable_cost_usd), 0) AS total_spend
         FROM usage_ledger
         WHERE org_id = ?`
      )
      .get(orgId) as { total_spend: number };
    const totalSpend = Number(spendRow.total_spend || 0);
    const pct = (totalSpend / billing.monthlyBudgetLimitUsd) * 100;

    if (pct >= billing.alertThresholdPercent) {
      this.database.db
        .prepare(
          `INSERT INTO budget_alerts (
            id, org_id, scope_type, scope_id, threshold_percent,
            consumed_usd, limit_usd, message, created_at
          ) VALUES (?, ?, 'organisation', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          generateId('balert'),
          orgId,
          orgId,
          billing.alertThresholdPercent,
          totalSpend,
          billing.monthlyBudgetLimitUsd,
          `Organisation budget consumption reached ${pct.toFixed(1)}% ($${totalSpend.toFixed(4)} / $${billing.monthlyBudgetLimitUsd.toFixed(4)}).`,
          new Date().toISOString()
        );
    }
  }

  public getOrgUsageSummary(orgId: string): {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedTokens: number;
    totalActualCostUsd: number;
    totalEstimatedCostUsd: number;
    totalBillableCostUsd: number;
    cacheHits: number;
    fallbacksUsed: number;
    byProvider: Record<string, { requests: number; tokens: number; billableCostUsd: number }>;
    byModel: Record<string, { requests: number; tokens: number; billableCostUsd: number }>;
    byFeatureModule: Record<string, { requests: number; tokens: number; billableCostUsd: number }>;
    billingAccount: BillingAccountState;
    recentAlerts: Array<{
      id: string;
      thresholdPercent: number;
      consumedUsd: number;
      limitUsd: number;
      message: string;
      createdAt: string;
    }>;
  } {
    const rows = this.database.db
      .prepare(`SELECT * FROM usage_ledger WHERE org_id = ? ORDER BY created_at DESC`)
      .all(orgId) as Array<Record<string, unknown>>;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;
    let totalActualCostUsd = 0;
    let totalEstimatedCostUsd = 0;
    let totalBillableCostUsd = 0;
    let cacheHits = 0;
    let fallbacksUsed = 0;

    const byProvider: Record<string, { requests: number; tokens: number; billableCostUsd: number }> =
      {};
    const byModel: Record<string, { requests: number; tokens: number; billableCostUsd: number }> = {};
    const byFeatureModule: Record<
      string,
      { requests: number; tokens: number; billableCostUsd: number }
    > = {};

    for (const r of rows) {
      const inTok = Number(r.input_tokens || 0);
      const outTok = Number(r.output_tokens || 0);
      const cachedTok = Number(r.cached_tokens || 0);
      const estCost = Number(r.estimated_cost_usd || 0);
      const billCost = Number(r.billable_cost_usd || 0);
      const actCost =
        r.actual_provider_cost_usd !== null && r.actual_provider_cost_usd !== undefined
          ? Number(r.actual_provider_cost_usd)
          : estCost;

      totalInputTokens += inTok;
      totalOutputTokens += outTok;
      totalCachedTokens += cachedTok;
      totalActualCostUsd += actCost;
      totalEstimatedCostUsd += estCost;
      totalBillableCostUsd += billCost;
      if (Number(r.cache_hit) === 1) cacheHits++;
      if (Number(r.fallback_used) === 1) fallbacksUsed++;

      const provider = String(r.provider);
      const modelId = String(r.model_id);
      const featureMod = String(r.feature_module || 'griot_chat');

      if (!byProvider[provider]) {
        byProvider[provider] = { requests: 0, tokens: 0, billableCostUsd: 0 };
      }
      byProvider[provider].requests += 1;
      byProvider[provider].tokens += inTok + outTok;
      byProvider[provider].billableCostUsd = Number(
        (byProvider[provider].billableCostUsd + billCost).toFixed(8)
      );

      if (!byModel[modelId]) {
        byModel[modelId] = { requests: 0, tokens: 0, billableCostUsd: 0 };
      }
      byModel[modelId].requests += 1;
      byModel[modelId].tokens += inTok + outTok;
      byModel[modelId].billableCostUsd = Number(
        (byModel[modelId].billableCostUsd + billCost).toFixed(8)
      );

      if (!byFeatureModule[featureMod]) {
        byFeatureModule[featureMod] = { requests: 0, tokens: 0, billableCostUsd: 0 };
      }
      byFeatureModule[featureMod].requests += 1;
      byFeatureModule[featureMod].tokens += inTok + outTok;
      byFeatureModule[featureMod].billableCostUsd = Number(
        (byFeatureModule[featureMod].billableCostUsd + billCost).toFixed(8)
      );
    }

    const alerts = this.database.db
      .prepare(
        `SELECT * FROM budget_alerts WHERE org_id = ? ORDER BY created_at DESC LIMIT 20`
      )
      .all(orgId) as Array<Record<string, unknown>>;

    return {
      totalRequests: rows.length,
      totalInputTokens,
      totalOutputTokens,
      totalCachedTokens,
      totalActualCostUsd: Number(totalActualCostUsd.toFixed(8)),
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(8)),
      totalBillableCostUsd: Number(totalBillableCostUsd.toFixed(8)),
      cacheHits,
      fallbacksUsed,
      byProvider,
      byModel,
      byFeatureModule,
      billingAccount: this.getBillingAccount(orgId),
      recentAlerts: alerts.map((a) => ({
        id: String(a.id),
        thresholdPercent: Number(a.threshold_percent),
        consumedUsd: Number(a.consumed_usd),
        limitUsd: Number(a.limit_usd),
        message: String(a.message),
        createdAt: String(a.created_at),
      })),
    };
  }
}
