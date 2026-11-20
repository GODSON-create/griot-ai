// ============================================================================
// GRIOT AI — AUTHENTICATION & SERVER-SIDE AUTHORISATION ENGINE
// Supports Platform Administrator, Organisation Owner, Organisation Admin,
// Developer, Member, Billing, Viewer, and Support Auditor roles.
// ============================================================================

import type { GriotDatabase } from '../db/database.ts';
import type { AuthContext, OrgRole, PermissionScope } from '../types/domain.ts';
import { hashApiKey, verifyJwtToken } from './crypto.ts';

export const ROLE_DEFAULT_SCOPES: Record<OrgRole, PermissionScope[]> = {
  platform_admin: [
    'chat:write',
    'conversations:read',
    'conversations:write',
    'conversations:delete',
    'models:read',
    'models:admin',
    'files:read',
    'files:write',
    'knowledge:read',
    'knowledge:write',
    'usage:read',
    'billing:write',
    'org:read',
    'org:admin',
    'apikeys:manage',
    'admin:observability',
    'admin:platform',
  ],
  owner: [
    'chat:write',
    'conversations:read',
    'conversations:write',
    'conversations:delete',
    'models:read',
    'models:admin',
    'files:read',
    'files:write',
    'knowledge:read',
    'knowledge:write',
    'usage:read',
    'billing:write',
    'org:read',
    'org:admin',
    'apikeys:manage',
    'admin:observability',
  ],
  admin: [
    'chat:write',
    'conversations:read',
    'conversations:write',
    'conversations:delete',
    'models:read',
    'models:admin',
    'files:read',
    'files:write',
    'knowledge:read',
    'knowledge:write',
    'usage:read',
    'billing:write',
    'org:read',
    'org:admin',
    'apikeys:manage',
    'admin:observability',
  ],
  developer: [
    'chat:write',
    'conversations:read',
    'conversations:write',
    'conversations:delete',
    'models:read',
    'files:read',
    'files:write',
    'knowledge:read',
    'knowledge:write',
    'usage:read',
    'org:read',
    'apikeys:manage',
  ],
  member: [
    'chat:write',
    'conversations:read',
    'conversations:write',
    'conversations:delete',
    'models:read',
    'files:read',
    'files:write',
    'knowledge:read',
    'org:read',
  ],
  billing: ['usage:read', 'billing:write', 'org:read', 'models:read'],
  viewer: ['conversations:read', 'models:read', 'knowledge:read', 'usage:read', 'org:read'],
  support_auditor: [
    'org:read',
    'usage:read',
    'models:read',
    'admin:observability',
    'admin:support_investigate',
  ],
};

export class AuthError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 401, code = 'UNAUTHENTICATED') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class AuthService {
  private readonly database: GriotDatabase;
  private readonly jwtSecret: string;
  private readonly defaultRpm: number;

  constructor(database: GriotDatabase, jwtSecret: string, defaultRpm = 120) {
    this.database = database;
    this.jwtSecret = jwtSecret;
    this.defaultRpm = defaultRpm;
  }

  public authenticateHeaders(
    headers: Record<string, string | string[] | undefined>,
    ipAddress = '127.0.0.1'
  ): AuthContext {
    const rawAuth = Array.isArray(headers['authorization'])
      ? headers['authorization'][0]
      : headers['authorization'];
    const rawApiKeyHeader = Array.isArray(headers['x-griot-api-key'])
      ? headers['x-griot-api-key'][0]
      : headers['x-griot-api-key'];
    const requestedOrgHeader = Array.isArray(headers['x-griot-org-id'])
      ? headers['x-griot-org-id'][0]
      : headers['x-griot-org-id'];
    const requestedWorkspaceHeader = Array.isArray(headers['x-griot-workspace-id'])
      ? headers['x-griot-workspace-id'][0]
      : headers['x-griot-workspace-id'];

    if (rawApiKeyHeader) {
      return this.authenticateApiKey(
        rawApiKeyHeader.trim(),
        requestedOrgHeader,
        requestedWorkspaceHeader,
        ipAddress
      );
    }

    if (rawAuth) {
      const trimmed = rawAuth.trim();
      if (trimmed.toLowerCase().startsWith('bearer ')) {
        const token = trimmed.slice(7).trim();
        if (token.startsWith('griot_sk_')) {
          return this.authenticateApiKey(
            token,
            requestedOrgHeader,
            requestedWorkspaceHeader,
            ipAddress
          );
        }
        return this.authenticateJwt(
          token,
          requestedOrgHeader,
          requestedWorkspaceHeader,
          ipAddress
        );
      }
    }

    throw new AuthError(
      'Missing authentication credentials. Provide Authorization: Bearer <jwt> or X-Griot-Api-Key.',
      401,
      'UNAUTHENTICATED'
    );
  }

  public authenticateApiKey(
    rawKey: string,
    requestedOrgId?: string,
    requestedWorkspaceId?: string,
    ipAddress = '127.0.0.1'
  ): AuthContext {
    const keyHash = hashApiKey(rawKey);
    const row = this.database.db
      .prepare(
        `SELECT ak.*, o.status AS org_status, u.status AS user_status, u.is_platform_admin
         FROM api_credentials ak
         JOIN organisations o ON o.id = ak.org_id
         JOIN users u ON u.id = ak.created_by_user_id
         WHERE ak.key_hash = ?`
      )
      .get(keyHash) as Record<string, unknown> | undefined;

    if (!row) {
      throw new AuthError('Invalid API key.', 401, 'INVALID_API_KEY');
    }

    if (row.status !== 'active') {
      throw new AuthError('API key has been revoked or disabled.', 401, 'REVOKED_API_KEY');
    }

    if (row.expires_at && String(row.expires_at) < new Date().toISOString()) {
      throw new AuthError('API key has expired.', 401, 'EXPIRED_API_KEY');
    }

    if (row.org_status !== 'active') {
      throw new AuthError('Organisation is suspended or inactive.', 403, 'ORG_INACTIVE');
    }

    if (row.user_status !== 'active') {
      throw new AuthError('API key owner account is inactive.', 403, 'USER_INACTIVE');
    }

    const orgId = String(row.org_id);
    if (requestedOrgId && requestedOrgId !== orgId) {
      throw new AuthError(
        'Tenant isolation violation: API key does not belong to requested organisation.',
        403,
        'TENANT_ISOLATION_DENIED'
      );
    }

    const boundWorkspaceId = row.workspace_id ? String(row.workspace_id) : null;
    if (
      boundWorkspaceId &&
      requestedWorkspaceId &&
      requestedWorkspaceId !== boundWorkspaceId
    ) {
      throw new AuthError(
        'Workspace isolation violation: API key is restricted to a different workspace.',
        403,
        'WORKSPACE_ISOLATION_DENIED'
      );
    }

    this.database.db
      .prepare(`UPDATE api_credentials SET last_used_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), String(row.id));

    const scopes = JSON.parse(String(row.scopes_json || '[]')) as PermissionScope[];

    return {
      authType: 'api_key',
      userId: String(row.created_by_user_id),
      orgId,
      workspaceId: requestedWorkspaceId || boundWorkspaceId,
      apiKeyId: String(row.id),
      role: 'developer',
      isPlatformAdmin: Boolean(row.is_platform_admin),
      scopes,
      rateLimitRpm: Number(row.rate_limit_rpm || this.defaultRpm),
      ipAddress,
    };
  }

  public authenticateJwt(
    token: string,
    requestedOrgId?: string,
    requestedWorkspaceId?: string,
    ipAddress = '127.0.0.1'
  ): AuthContext {
    let claims;
    try {
      claims = verifyJwtToken(token, this.jwtSecret);
    } catch (err) {
      throw new AuthError(
        `Invalid or expired JWT: ${(err as Error).message}`,
        401,
        'INVALID_JWT'
      );
    }

    const targetOrgId = requestedOrgId || claims.orgId;
    const membership = this.database.db
      .prepare(
        `SELECT m.role, m.permissions_json, o.status AS org_status, u.status AS user_status, u.is_platform_admin
         FROM organisation_members m
         JOIN organisations o ON o.id = m.org_id
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = ? AND m.user_id = ?`
      )
      .get(targetOrgId, claims.sub) as Record<string, unknown> | undefined;

    if (!membership) {
      throw new AuthError(
        'Tenant isolation violation: User is not an authorised member of this organisation.',
        403,
        'TENANT_ISOLATION_DENIED'
      );
    }

    if (membership.org_status !== 'active') {
      throw new AuthError('Organisation is suspended or inactive.', 403, 'ORG_INACTIVE');
    }

    if (membership.user_status !== 'active') {
      throw new AuthError('User account is inactive or deleted.', 403, 'USER_INACTIVE');
    }

    const role = String(membership.role) as OrgRole;
    const isPlatformAdmin =
      Boolean(membership.is_platform_admin) || role === 'platform_admin';
    const customPerms = JSON.parse(
      String(membership.permissions_json || '[]')
    ) as PermissionScope[];
    const baseScopes = isPlatformAdmin
      ? ROLE_DEFAULT_SCOPES.platform_admin
      : ROLE_DEFAULT_SCOPES[role] || [];
    const scopes = Array.from(new Set([...baseScopes, ...customPerms]));

    const workspaceId = requestedWorkspaceId || claims.workspaceId || null;
    if (workspaceId) {
      const ws = this.database.db
        .prepare(`SELECT id FROM workspaces WHERE id = ? AND org_id = ?`)
        .get(workspaceId, targetOrgId);
      if (!ws) {
        throw new AuthError(
          'Workspace does not belong to the active organisation.',
          403,
          'WORKSPACE_ISOLATION_DENIED'
        );
      }
    }

    return {
      authType: 'jwt',
      userId: claims.sub,
      orgId: targetOrgId,
      workspaceId,
      apiKeyId: null,
      role,
      isPlatformAdmin,
      scopes,
      rateLimitRpm: this.defaultRpm,
      ipAddress,
    };
  }

  public requireScope(ctx: AuthContext, requiredScope: PermissionScope): void {
    if (!ctx.scopes.includes(requiredScope)) {
      throw new AuthError(
        `Insufficient permissions: missing required scope '${requiredScope}'.`,
        403,
        'FORBIDDEN_SCOPE'
      );
    }
  }

  public requirePlatformAdmin(ctx: AuthContext): void {
    if (!ctx.isPlatformAdmin && !ctx.scopes.includes('admin:platform')) {
      throw new AuthError(
        'Access denied: platform administration is restricted to explicitly authorised platform administrators.',
        403,
        'FORBIDDEN_PLATFORM_ADMIN'
      );
    }
  }

  public requireTenantMatch(ctx: AuthContext, resourceOrgId: string): void {
    if (ctx.orgId !== resourceOrgId) {
      throw new AuthError(
        'Cross-tenant access denied: resource belongs to another organisation.',
        403,
        'TENANT_ISOLATION_DENIED'
      );
    }
  }
}
