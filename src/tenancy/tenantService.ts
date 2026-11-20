// ============================================================================
// GRIOT AI — MULTI-TENANT IDENTITY & ORGANISATION SERVICE
// Implements Locked Business Decisions:
// 1. Avantage Group access: FREE ('avantage_free')
// 2. Public access: FREEMIUM ('public_freemium')
// 3. Enterprise deployment: SHARED infrastructure with strict tenant isolation ('enterprise_contract')
// 4. Dual Branding: 'griot_standalone' ("GRIOT") & 'griot_powered_by_avantage' ("GRIOT powered by Avantage")
// ============================================================================

import type { GriotDatabase } from '../db/database.ts';
import type { AuditAndRetentionService } from '../security/auditAndRetention.ts';
import { ROLE_DEFAULT_SCOPES } from '../security/auth.ts';
import {
  decryptSecretVault,
  encryptSecretVault,
  generateApiKey,
  generateId,
  hashPassword,
  signJwtToken,
  verifyPassword,
} from '../security/crypto.ts';
import type {
  AccessModelType,
  BrandingMode,
  OrgRole,
  Organisation,
  OrganisationMember,
  OrganisationPreferences,
  PermissionScope,
  ProviderName,
  RoutingTier,
  UserAccount,
  UserPreferences,
  Workspace,
} from '../types/domain.ts';

export class TenantService {
  private readonly database: GriotDatabase;
  private readonly audit: AuditAndRetentionService;
  private readonly jwtSecret: string;
  private readonly vaultMasterKey: string;

  constructor(params: {
    database: GriotDatabase;
    audit: AuditAndRetentionService;
    jwtSecret: string;
    vaultMasterKey: string;
  }) {
    this.database = params.database;
    this.audit = params.audit;
    this.jwtSecret = params.jwtSecret;
    this.vaultMasterKey = params.vaultMasterKey;
  }

  public createOrganisation(params: {
    name: string;
    slug: string;
    isAvantageInternal?: boolean;
    accessModel?: AccessModelType;
    brandingMode?: BrandingMode;
    parentGroup?: string | null;
    tier?: RoutingTier;
    preferences?: OrganisationPreferences;
    dataRetentionDays?: number;
    initialBilling?: {
      freeCreditsUsd?: number;
      subscriptionAllowanceUsd?: number;
      prepaidCreditsUsd?: number;
      enterpriseAllocationUsd?: number;
      promotionalCreditsUsd?: number;
      monthlyBudgetLimitUsd?: number | null;
      alertThresholdPercent?: number;
    };
  }): Organisation {
    const id = generateId('org');
    const createdAt = new Date().toISOString();
    const isInternal = params.isAvantageInternal ? 1 : 0;

    // Locked Business Decision 1, 2, 3:
    // Avantage Group -> 'avantage_free'
    // Enterprise tier -> 'enterprise_contract'
    // Public/Standard -> 'public_freemium'
    const accessModel: AccessModelType =
      params.accessModel ??
      (params.isAvantageInternal
        ? 'avantage_free'
        : params.tier === 'enterprise'
          ? 'enterprise_contract'
          : 'public_freemium');

    // Locked Business Decision 4: Dual Branding
    const brandingMode: BrandingMode =
      params.brandingMode ??
      (params.isAvantageInternal ? 'griot_powered_by_avantage' : 'griot_standalone');

    const parentGroup =
      params.parentGroup ?? (params.isAvantageInternal ? 'Avantage Group' : null);
    const tier: RoutingTier =
      params.tier ??
      (params.isAvantageInternal || accessModel === 'enterprise_contract'
        ? 'enterprise'
        : 'standard');
    const preferences: OrganisationPreferences = params.preferences ?? {};
    const retentionDays = params.dataRetentionDays ?? 365;

    return this.database.transaction(() => {
      this.database.db
        .prepare(
          `INSERT INTO organisations (
            id, slug, name, is_avantage_internal, access_model, branding_mode,
            parent_group, tier, status, preferences_json, data_retention_days, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
        )
        .run(
          id,
          params.slug,
          params.name,
          isInternal,
          accessModel,
          brandingMode,
          parentGroup,
          tier,
          JSON.stringify(preferences),
          retentionDays,
          createdAt
        );

      const billingId = generateId('bill');
      const b = params.initialBilling || {};
      this.database.db
        .prepare(
          `INSERT INTO billing_accounts (
            id, org_id, currency, free_credits_usd, subscription_allowance_usd,
            prepaid_credits_usd, enterprise_allocation_usd, promotional_credits_usd,
            monthly_budget_limit_usd, alert_threshold_percent, status, updated_at
          ) VALUES (?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
        )
        .run(
          billingId,
          id,
          b.freeCreditsUsd ?? 5.0,
          b.subscriptionAllowanceUsd ?? 0.0,
          b.prepaidCreditsUsd ?? 0.0,
          b.enterpriseAllocationUsd ??
            (accessModel === 'enterprise_contract' || params.isAvantageInternal ? 500.0 : 0.0),
          b.promotionalCreditsUsd ?? 0.0,
          b.monthlyBudgetLimitUsd ?? null,
          b.alertThresholdPercent ?? 80.0,
          createdAt
        );

      const wsId = generateId('ws');
      this.database.db
        .prepare(
          `INSERT INTO workspaces (id, org_id, name, slug, description, created_at)
           VALUES (?, ?, 'Default Workspace', 'default', 'Primary workspace', ?)`
        )
        .run(wsId, id, createdAt);

      this.audit.record({
        orgId: id,
        action: 'organisation.created',
        resourceType: 'organisation',
        resourceId: id,
        outcome: 'success',
        details: {
          slug: params.slug,
          isAvantageInternal: Boolean(params.isAvantageInternal),
          accessModel,
          brandingMode,
          parentGroup,
          tier,
        },
      });

      return {
        id,
        slug: params.slug,
        name: params.name,
        isAvantageInternal: Boolean(params.isAvantageInternal),
        accessModel,
        brandingMode,
        brandDisplayName:
          brandingMode === 'griot_powered_by_avantage'
            ? 'GRIOT powered by Avantage'
            : 'GRIOT',
        parentGroup,
        tier,
        status: 'active',
        preferences,
        dataRetentionDays: retentionDays,
        createdAt,
      };
    });
  }

  public getOrganisation(orgId: string): Organisation | null {
    const row = this.database.db
      .prepare(`SELECT * FROM organisations WHERE id = ?`)
      .get(orgId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapOrganisationRow(row);
  }

  /**
   * Lists all organisations an identity is authorised to participate in without mixing tenant data.
   */
  public listUserOrganisations(userId: string): Array<{
    organisation: Organisation;
    role: OrgRole;
  }> {
    const rows = this.database.db
      .prepare(
        `SELECT o.*, m.role AS member_role
         FROM organisation_members m
         JOIN organisations o ON o.id = m.org_id
         WHERE m.user_id = ? AND o.status = 'active'
         ORDER BY o.created_at ASC`
      )
      .all(userId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      organisation: this.mapOrganisationRow(r),
      role: String(r.member_role) as OrgRole,
    }));
  }

  public updateOrganisationPreferences(
    orgId: string,
    actorUserId: string,
    preferences: OrganisationPreferences
  ): Organisation {
    const existing = this.getOrganisation(orgId);
    if (!existing) {
      throw new Error(`Organisation ${orgId} not found`);
    }
    const merged: OrganisationPreferences = {
      ...existing.preferences,
      ...preferences,
    };
    this.database.db
      .prepare(`UPDATE organisations SET preferences_json = ? WHERE id = ?`)
      .run(JSON.stringify(merged), orgId);

    this.audit.record({
      orgId,
      actorUserId,
      action: 'organisation.preferences_updated',
      resourceType: 'organisation',
      resourceId: orgId,
      outcome: 'success',
      details: { preferences: merged },
    });

    return { ...existing, preferences: merged };
  }

  public createUserAccount(params: {
    email: string;
    displayName: string;
    password: string;
    createPersonalOrg?: boolean;
    isPlatformAdmin?: boolean;
    preferences?: UserPreferences;
    spendingLimitUsd?: number | null;
  }): { user: UserAccount; personalOrg: Organisation | null; accessToken: string | null } {
    const userId = generateId('usr');
    const createdAt = new Date().toISOString();
    const passwordHash = hashPassword(params.password);
    const isPlatformAdmin = Boolean(params.isPlatformAdmin);
    const userPrefs: UserPreferences = params.preferences ?? {};

    return this.database.transaction(() => {
      let personalOrg: Organisation | null = null;
      if (params.createPersonalOrg !== false) {
        const cleanSlug =
          params.email
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') +
          '-' +
          userId.slice(-6);
        personalOrg = this.createOrganisation({
          name: `${params.displayName}'s Personal Organisation`,
          slug: cleanSlug,
          isAvantageInternal: false,
          accessModel: 'public_freemium',
          brandingMode: 'griot_standalone',
          tier: 'standard',
        });
      }

      this.database.db
        .prepare(
          `INSERT INTO users (
            id, email, display_name, password_hash, is_platform_admin,
            preferences_json, status, personal_org_id, spending_limit_usd,
            retention_days, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 365, ?)`
        )
        .run(
          userId,
          params.email.toLowerCase().trim(),
          params.displayName,
          passwordHash,
          isPlatformAdmin ? 1 : 0,
          JSON.stringify(userPrefs),
          personalOrg ? personalOrg.id : null,
          params.spendingLimitUsd ?? null,
          createdAt
        );

      let accessToken: string | null = null;
      if (personalOrg) {
        this.addMember({
          orgId: personalOrg.id,
          userId,
          role: isPlatformAdmin ? 'platform_admin' : 'owner',
        });
        accessToken = this.issueJwtForMember(userId, personalOrg.id);
      }

      return {
        user: {
          id: userId,
          email: params.email.toLowerCase().trim(),
          displayName: params.displayName,
          isPlatformAdmin,
          preferences: userPrefs,
          status: 'active',
          personalOrgId: personalOrg ? personalOrg.id : null,
          spendingLimitUsd: params.spendingLimitUsd ?? null,
          retentionDays: 365,
          createdAt,
          deletedAt: null,
        },
        personalOrg,
        accessToken,
      };
    });
  }

  public getUserPreferences(userId: string): UserPreferences {
    const row = this.database.db
      .prepare(`SELECT preferences_json FROM users WHERE id = ?`)
      .get(userId) as { preferences_json: string } | undefined;
    if (!row) return {};
    return JSON.parse(String(row.preferences_json || '{}')) as UserPreferences;
  }

  public updateUserPreferences(
    userId: string,
    preferences: UserPreferences
  ): UserPreferences {
    const existing = this.getUserPreferences(userId);
    const merged: UserPreferences = { ...existing, ...preferences };
    this.database.db
      .prepare(`UPDATE users SET preferences_json = ? WHERE id = ?`)
      .run(JSON.stringify(merged), userId);
    return merged;
  }

  public authenticateUserLogin(params: {
    email: string;
    password: string;
    orgId?: string;
  }): { user: UserAccount; orgId: string; accessToken: string } {
    const row = this.database.db
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .get(params.email.toLowerCase().trim()) as Record<string, unknown> | undefined;

    if (!row || row.status !== 'active') {
      throw new Error('Invalid email or password');
    }

    if (!verifyPassword(params.password, String(row.password_hash))) {
      throw new Error('Invalid email or password');
    }

    const userId = String(row.id);
    const targetOrgId = params.orgId || (row.personal_org_id ? String(row.personal_org_id) : '');
    if (!targetOrgId) {
      throw new Error('No target organisation specified for login');
    }

    const accessToken = this.issueJwtForMember(userId, targetOrgId);
    return {
      user: {
        id: userId,
        email: String(row.email),
        displayName: String(row.display_name),
        isPlatformAdmin: Boolean(row.is_platform_admin),
        preferences: JSON.parse(String(row.preferences_json || '{}')),
        status: 'active',
        personalOrgId: row.personal_org_id ? String(row.personal_org_id) : null,
        spendingLimitUsd:
          row.spending_limit_usd !== null && row.spending_limit_usd !== undefined
            ? Number(row.spending_limit_usd)
            : null,
        retentionDays: Number(row.retention_days),
        createdAt: String(row.created_at),
        deletedAt: null,
      },
      orgId: targetOrgId,
      accessToken,
    };
  }

  public issueJwtForMember(
    userId: string,
    orgId: string,
    workspaceId?: string | null
  ): string {
    const member = this.database.db
      .prepare(
        `SELECT m.role, m.permissions_json, u.is_platform_admin
         FROM organisation_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = ? AND m.user_id = ?`
      )
      .get(orgId, userId) as Record<string, unknown> | undefined;

    if (!member) {
      throw new Error(`User ${userId} is not a member of organisation ${orgId}`);
    }

    const role = String(member.role) as OrgRole;
    const isPlatformAdmin = Boolean(member.is_platform_admin) || role === 'platform_admin';
    const customPerms = JSON.parse(String(member.permissions_json || '[]')) as PermissionScope[];
    const baseScopes = isPlatformAdmin
      ? ROLE_DEFAULT_SCOPES.platform_admin
      : ROLE_DEFAULT_SCOPES[role] || [];
    const scopes = Array.from(new Set([...baseScopes, ...customPerms]));

    return signJwtToken(
      {
        sub: userId,
        orgId,
        workspaceId: workspaceId ?? null,
        role,
        scopes,
      },
      this.jwtSecret
    );
  }

  public addMember(params: {
    orgId: string;
    userId: string;
    role: OrgRole;
    permissions?: PermissionScope[];
    spendingLimitUsd?: number | null;
  }): OrganisationMember {
    const id = generateId('mem');
    const createdAt = new Date().toISOString();
    const permissions = params.permissions ?? ROLE_DEFAULT_SCOPES[params.role] ?? [];

    this.database.db
      .prepare(
        `INSERT INTO organisation_members (
          id, org_id, user_id, role, permissions_json, spending_limit_usd, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(org_id, user_id) DO UPDATE SET
          role = excluded.role,
          permissions_json = excluded.permissions_json,
          spending_limit_usd = excluded.spending_limit_usd`
      )
      .run(
        id,
        params.orgId,
        params.userId,
        params.role,
        JSON.stringify(permissions),
        params.spendingLimitUsd ?? null,
        createdAt
      );

    return {
      id,
      orgId: params.orgId,
      userId: params.userId,
      role: params.role,
      permissions,
      spendingLimitUsd: params.spendingLimitUsd ?? null,
      createdAt,
    };
  }

  public createWorkspace(params: {
    orgId: string;
    name: string;
    slug: string;
    description?: string;
    actorUserId?: string;
  }): Workspace {
    const id = generateId('ws');
    const createdAt = new Date().toISOString();
    this.database.db
      .prepare(
        `INSERT INTO workspaces (id, org_id, name, slug, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, params.orgId, params.name, params.slug, params.description ?? '', createdAt);

    this.audit.record({
      orgId: params.orgId,
      actorUserId: params.actorUserId ?? null,
      action: 'workspace.created',
      resourceType: 'workspace',
      resourceId: id,
      outcome: 'success',
      details: { slug: params.slug, name: params.name },
    });

    return {
      id,
      orgId: params.orgId,
      name: params.name,
      slug: params.slug,
      description: params.description ?? '',
      createdAt,
    };
  }

  public listWorkspaces(orgId: string): Workspace[] {
    const rows = this.database.db
      .prepare(`SELECT * FROM workspaces WHERE org_id = ? ORDER BY created_at ASC`)
      .all(orgId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      name: String(r.name),
      slug: String(r.slug),
      description: String(r.description),
      createdAt: String(r.created_at),
    }));
  }

  public createApiKey(params: {
    orgId: string;
    workspaceId?: string | null;
    createdByUserId: string;
    name: string;
    scopes?: PermissionScope[];
    spendingLimitUsd?: number | null;
    rateLimitRpm?: number;
    expiresAt?: string | null;
  }): {
    id: string;
    rawKey: string;
    keyPrefix: string;
    orgId: string;
    workspaceId: string | null;
    scopes: PermissionScope[];
    spendingLimitUsd: number | null;
    rateLimitRpm: number;
    createdAt: string;
  } {
    const id = generateId('key');
    const createdAt = new Date().toISOString();
    const { rawKey, keyPrefix, keyHash } = generateApiKey();
    const scopes: PermissionScope[] = params.scopes ?? [
      'chat:write',
      'conversations:read',
      'conversations:write',
      'models:read',
    ];
    const rateLimitRpm = params.rateLimitRpm ?? 60;

    this.database.db
      .prepare(
        `INSERT INTO api_credentials (
          id, org_id, workspace_id, created_by_user_id, name,
          key_prefix, key_hash, scopes_json, spending_limit_usd,
          rate_limit_rpm, status, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(
        id,
        params.orgId,
        params.workspaceId ?? null,
        params.createdByUserId,
        params.name,
        keyPrefix,
        keyHash,
        JSON.stringify(scopes),
        params.spendingLimitUsd ?? null,
        rateLimitRpm,
        params.expiresAt ?? null,
        createdAt
      );

    this.audit.record({
      orgId: params.orgId,
      actorUserId: params.createdByUserId,
      action: 'apikey.created',
      resourceType: 'api_credential',
      resourceId: id,
      outcome: 'success',
      details: { keyPrefix, name: params.name, scopes, spendingLimitUsd: params.spendingLimitUsd },
    });

    return {
      id,
      rawKey,
      keyPrefix,
      orgId: params.orgId,
      workspaceId: params.workspaceId ?? null,
      scopes,
      spendingLimitUsd: params.spendingLimitUsd ?? null,
      rateLimitRpm,
      createdAt,
    };
  }

  public revokeApiKey(orgId: string, apiKeyId: string, actorUserId: string): boolean {
    const res = this.database.db
      .prepare(`UPDATE api_credentials SET status = 'revoked' WHERE id = ? AND org_id = ?`)
      .run(apiKeyId, orgId);

    if (Number(res.changes) > 0) {
      this.audit.record({
        orgId,
        actorUserId,
        action: 'apikey.revoked',
        resourceType: 'api_credential',
        resourceId: apiKeyId,
        outcome: 'success',
      });
      return true;
    }
    return false;
  }

  public listApiKeys(orgId: string): Array<{
    id: string;
    name: string;
    keyPrefix: string;
    scopes: PermissionScope[];
    spendingLimitUsd: number | null;
    rateLimitRpm: number;
    status: string;
    createdAt: string;
    lastUsedAt: string | null;
  }> {
    const rows = this.database.db
      .prepare(`SELECT * FROM api_credentials WHERE org_id = ? ORDER BY created_at DESC`)
      .all(orgId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      keyPrefix: String(r.key_prefix),
      scopes: JSON.parse(String(r.scopes_json || '[]')),
      spendingLimitUsd:
        r.spending_limit_usd !== null && r.spending_limit_usd !== undefined
          ? Number(r.spending_limit_usd)
          : null,
      rateLimitRpm: Number(r.rate_limit_rpm),
      status: String(r.status),
      createdAt: String(r.created_at),
      lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
    }));
  }

  public setOrgProviderCredential(params: {
    orgId: string;
    actorUserId: string;
    provider: ProviderName;
    rawApiKey: string;
  }): { provider: ProviderName; keyHint: string; updatedAt: string } {
    const id = generateId('pvault');
    const updatedAt = new Date().toISOString();
    const encrypted = encryptSecretVault(params.rawApiKey, this.vaultMasterKey);

    this.database.db
      .prepare(
        `INSERT INTO provider_credentials_vault (
          id, org_id, provider, encrypted_secret, iv, auth_tag, key_hint, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(org_id, provider) DO UPDATE SET
          encrypted_secret = excluded.encrypted_secret,
          iv = excluded.iv,
          auth_tag = excluded.auth_tag,
          key_hint = excluded.key_hint,
          updated_at = excluded.updated_at`
      )
      .run(
        id,
        params.orgId,
        params.provider,
        encrypted.encryptedSecret,
        encrypted.iv,
        encrypted.authTag,
        encrypted.keyHint,
        updatedAt
      );

    this.audit.record({
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      action: 'provider_credential.vault_updated',
      resourceType: 'provider_credential',
      resourceId: `${params.orgId}:${params.provider}`,
      outcome: 'success',
      details: { provider: params.provider, keyHint: encrypted.keyHint },
    });

    return {
      provider: params.provider,
      keyHint: encrypted.keyHint,
      updatedAt,
    };
  }

  public getOrgProviderCredential(orgId: string, provider: ProviderName): string | null {
    const row = this.database.db
      .prepare(
        `SELECT encrypted_secret, iv, auth_tag FROM provider_credentials_vault
         WHERE org_id = ? AND provider = ?`
      )
      .get(orgId, provider) as Record<string, unknown> | undefined;

    if (!row) return null;
    return decryptSecretVault(
      {
        encryptedSecret: String(row.encrypted_secret),
        iv: String(row.iv),
        authTag: String(row.auth_tag),
      },
      this.vaultMasterKey
    );
  }

  private mapOrganisationRow(row: Record<string, unknown>): Organisation {
    const brandingMode = (String(row.branding_mode || 'griot_standalone') as BrandingMode);
    return {
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      isAvantageInternal: Boolean(row.is_avantage_internal),
      accessModel: String(row.access_model || 'public_freemium') as AccessModelType,
      brandingMode,
      brandDisplayName:
        brandingMode === 'griot_powered_by_avantage'
          ? 'GRIOT powered by Avantage'
          : 'GRIOT',
      parentGroup: row.parent_group ? String(row.parent_group) : null,
      tier: String(row.tier) as RoutingTier,
      status: String(row.status) as Organisation['status'],
      preferences: JSON.parse(String(row.preferences_json || '{}')),
      dataRetentionDays: Number(row.data_retention_days),
      createdAt: String(row.created_at),
    };
  }
}
