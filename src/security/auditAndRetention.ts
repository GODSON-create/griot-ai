// ============================================================================
// GRIOT AI — AUDIT LOGGING, DATA RETENTION & ACCOUNT DELETION WORKFLOWS
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import type { GriotDatabase } from '../db/database.ts';
import { generateId } from './crypto.ts';

export interface AuditLogInput {
  orgId?: string | null;
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: 'success' | 'denied' | 'failure';
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  ipAddress: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export class AuditAndRetentionService {
  private readonly database: GriotDatabase;
  private readonly privateStorageDir: string;

  constructor(database: GriotDatabase, privateStorageDir: string) {
    this.database = database;
    this.privateStorageDir = privateStorageDir;
  }

  public record(input: AuditLogInput): AuditLogEntry {
    const id = generateId('audit');
    const createdAt = new Date().toISOString();
    const detailsJson = JSON.stringify(input.details || {});

    this.database.db
      .prepare(
        `INSERT INTO audit_logs (
          id, org_id, actor_user_id, actor_api_key_id, action,
          resource_type, resource_id, outcome, ip_address, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.orgId ?? null,
        input.actorUserId ?? null,
        input.actorApiKeyId ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.outcome,
        input.ipAddress ?? null,
        detailsJson,
        createdAt
      );

    return {
      id,
      orgId: input.orgId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorApiKeyId: input.actorApiKeyId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome,
      ipAddress: input.ipAddress ?? null,
      details: input.details || {},
      createdAt,
    };
  }

  public listOrgAuditLogs(orgId: string, limit = 100): AuditLogEntry[] {
    const rows = this.database.db
      .prepare(
        `SELECT * FROM audit_logs
         WHERE org_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(orgId, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      orgId: r.org_id ? String(r.org_id) : null,
      actorUserId: r.actor_user_id ? String(r.actor_user_id) : null,
      actorApiKeyId: r.actor_api_key_id ? String(r.actor_api_key_id) : null,
      action: String(r.action),
      resourceType: String(r.resource_type),
      resourceId: r.resource_id ? String(r.resource_id) : null,
      outcome: String(r.outcome),
      ipAddress: r.ip_address ? String(r.ip_address) : null,
      details: JSON.parse(String(r.details_json || '{}')),
      createdAt: String(r.created_at),
    }));
  }

  /**
   * Enforces organisation data retention controls by purging expired conversations,
   * messages, and private files older than the organisation's `data_retention_days`.
   */
  public enforceDataRetention(orgId: string, overrideCutoffIso?: string): {
    purgedConversations: number;
    purgedFiles: number;
  } {
    const orgRow = this.database.db
      .prepare(`SELECT data_retention_days FROM organisations WHERE id = ?`)
      .get(orgId) as { data_retention_days: number } | undefined;

    if (!orgRow) {
      return { purgedConversations: 0, purgedFiles: 0 };
    }

    const cutoffIso =
      overrideCutoffIso ||
      new Date(Date.now() - orgRow.data_retention_days * 86400 * 1000).toISOString();

    return this.database.transaction(() => {
      // Purge expired private files from disk and DB
      const expiredFiles = this.database.db
        .prepare(
          `SELECT id, storage_rel_path FROM files
           WHERE org_id = ? AND (created_at < ? OR (expires_at IS NOT NULL AND expires_at < ?))`
        )
        .all(orgId, cutoffIso, new Date().toISOString()) as Array<{
        id: string;
        storage_rel_path: string;
      }>;

      for (const f of expiredFiles) {
        const absPath = path.resolve(this.privateStorageDir, f.storage_rel_path);
        if (fs.existsSync(absPath)) {
          try {
            fs.unlinkSync(absPath);
          } catch {
            // Continue cleanup even if file handle unavailable
          }
        }
        this.database.db.prepare(`DELETE FROM files WHERE id = ?`).run(f.id);
      }

      const convRes = this.database.db
        .prepare(`DELETE FROM conversations WHERE org_id = ? AND updated_at < ?`)
        .run(orgId, cutoffIso);

      this.record({
        orgId,
        action: 'retention.purge_executed',
        resourceType: 'organisation',
        resourceId: orgId,
        outcome: 'success',
        details: {
          cutoffIso,
          purgedConversations: Number(convRes.changes),
          purgedFiles: expiredFiles.length,
        },
      });

      return {
        purgedConversations: Number(convRes.changes),
        purgedFiles: expiredFiles.length,
      };
    });
  }

  /**
   * Executes an account deletion workflow:
   * - Revokes all API keys created by the user
   * - Purges the user's conversations, messages, and private uploaded files
   * - Removes organisation memberships
   * - Anonymizes the user account record while preserving immutable financial ledger integrity
   */
  public deleteUserAccount(params: {
    targetUserId: string;
    actorUserId: string;
    orgId: string;
  }): { deletedConversations: number; deletedFiles: number; revokedKeys: number } {
    return this.database.transaction(() => {
      const userFiles = this.database.db
        .prepare(`SELECT id, storage_rel_path FROM files WHERE uploaded_by_user_id = ?`)
        .all(params.targetUserId) as Array<{ id: string; storage_rel_path: string }>;

      for (const f of userFiles) {
        const absPath = path.resolve(this.privateStorageDir, f.storage_rel_path);
        if (fs.existsSync(absPath)) {
          try {
            fs.unlinkSync(absPath);
          } catch {
            // ignore
          }
        }
      }

      const fileDel = this.database.db
        .prepare(`DELETE FROM files WHERE uploaded_by_user_id = ?`)
        .run(params.targetUserId);

      const convDel = this.database.db
        .prepare(`DELETE FROM conversations WHERE user_id = ?`)
        .run(params.targetUserId);

      const keysRevoked = this.database.db
        .prepare(`UPDATE api_credentials SET status = 'revoked' WHERE created_by_user_id = ?`)
        .run(params.targetUserId);

      this.database.db
        .prepare(`DELETE FROM organisation_members WHERE user_id = ?`)
        .run(params.targetUserId);

      const anonymizedEmail = `deleted_${params.targetUserId}@redacted.griot.invalid`;
      this.database.db
        .prepare(
          `UPDATE users
           SET email = ?, display_name = '[Deleted User]', password_hash = 'DELETED',
               status = 'deleted', deleted_at = ?
           WHERE id = ?`
        )
        .run(anonymizedEmail, new Date().toISOString(), params.targetUserId);

      this.record({
        orgId: params.orgId,
        actorUserId: params.actorUserId,
        action: 'account.deleted',
        resourceType: 'user',
        resourceId: params.targetUserId,
        outcome: 'success',
        details: {
          deletedConversations: Number(convDel.changes),
          deletedFiles: Number(fileDel.changes),
          revokedKeys: Number(keysRevoked.changes),
        },
      });

      return {
        deletedConversations: Number(convDel.changes),
        deletedFiles: Number(fileDel.changes),
        revokedKeys: Number(keysRevoked.changes),
      };
    });
  }
}
