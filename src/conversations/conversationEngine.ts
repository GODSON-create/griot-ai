// ============================================================================
// GRIOT AI — PERSISTENT CONVERSATION & CONTEXT MANAGEMENT ENGINE
// Supports CRUD, archiving, message history, model & usage metadata storage,
// streaming & interrupted response persistence, strict authorisation, and
// bounded context selection with rolling conversation summarisation.
// ============================================================================

import type { GriotDatabase } from '../db/database.ts';
import { estimateTokenCount } from '../providers/adapter.ts';
import type { AuditAndRetentionService } from '../security/auditAndRetention.ts';
import { AuthError } from '../security/auth.ts';
import { generateId } from '../security/crypto.ts';
import type {
  AttachmentReference,
  AuthContext,
  ChatMessageInput,
  ProviderName,
} from '../types/domain.ts';

export interface ConversationRecord {
  id: string;
  orgId: string;
  workspaceId: string | null;
  userId: string;
  title: string;
  status: 'active' | 'archived';
  summaryContext: string;
  summarisedUpToSequence: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessageRecord {
  id: string;
  conversationId: string;
  orgId: string;
  userId: string;
  sequenceNum: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  attachments: AttachmentReference[];
  provider: ProviderName | null;
  modelId: string | null;
  status: 'completed' | 'streaming' | 'interrupted' | 'failed';
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  latencyMs: number;
  interruptedAtChar: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export class ConversationEngine {
  private readonly database: GriotDatabase;
  private readonly audit: AuditAndRetentionService;

  constructor(database: GriotDatabase, audit: AuditAndRetentionService) {
    this.database = database;
    this.audit = audit;
  }

  public createConversation(params: {
    auth: AuthContext;
    title?: string;
    metadata?: Record<string, unknown>;
  }): ConversationRecord {
    const id = generateId('conv');
    const now = new Date().toISOString();
    const title = (params.title || 'New Conversation').trim().slice(0, 200);

    this.database.db
      .prepare(
        `INSERT INTO conversations (
          id, org_id, workspace_id, user_id, title, status,
          summary_context, summarised_up_to_sequence, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', '', 0, ?, ?, ?)`
      )
      .run(
        id,
        params.auth.orgId,
        params.auth.workspaceId ?? null,
        params.auth.userId,
        title,
        JSON.stringify(params.metadata || {}),
        now,
        now
      );

    return {
      id,
      orgId: params.auth.orgId,
      workspaceId: params.auth.workspaceId ?? null,
      userId: params.auth.userId,
      title,
      status: 'active',
      summaryContext: '',
      summarisedUpToSequence: 0,
      metadata: params.metadata || {},
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Retrieves a conversation while enforcing strict tenant and user authorisation.
   */
  public getConversation(conversationId: string, auth: AuthContext): ConversationRecord {
    const row = this.database.db
      .prepare(`SELECT * FROM conversations WHERE id = ?`)
      .get(conversationId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Conversation '${conversationId}' not found.`);
    }

    if (String(row.org_id) !== auth.orgId) {
      this.audit.record({
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: 'conversation.cross_tenant_denied',
        resourceType: 'conversation',
        resourceId: conversationId,
        outcome: 'denied',
      });
      throw new AuthError(
        'Tenant isolation violation: conversation belongs to another organisation.',
        403,
        'TENANT_ISOLATION_DENIED'
      );
    }

    const isOwnerOrAdmin = auth.role === 'owner' || auth.role === 'admin';
    if (String(row.user_id) !== auth.userId && !isOwnerOrAdmin) {
      this.audit.record({
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: 'conversation.unauthorised_user_denied',
        resourceType: 'conversation',
        resourceId: conversationId,
        outcome: 'denied',
      });
      throw new AuthError(
        'Unauthorised: you can only access your own conversations.',
        403,
        'CONVERSATION_ACCESS_DENIED'
      );
    }

    return this.mapConversationRow(row);
  }

  public listConversations(
    auth: AuthContext,
    options?: { includeArchived?: boolean; limit?: number }
  ): ConversationRecord[] {
    const includeArchived = options?.includeArchived ?? false;
    const limit = options?.limit ?? 50;

    const statusClause = includeArchived ? '' : `AND status = 'active'`;
    const rows = this.database.db
      .prepare(
        `SELECT * FROM conversations
         WHERE org_id = ? AND user_id = ? ${statusClause}
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(auth.orgId, auth.userId, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapConversationRow(r));
  }

  public renameConversation(
    conversationId: string,
    newTitle: string,
    auth: AuthContext
  ): ConversationRecord {
    const conv = this.getConversation(conversationId, auth);
    const cleaned = newTitle.trim().slice(0, 200);
    if (!cleaned) {
      throw new Error('Conversation title cannot be empty.');
    }
    const updatedAt = new Date().toISOString();
    this.database.db
      .prepare(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`)
      .run(cleaned, updatedAt, conv.id);

    return {
      ...conv,
      title: cleaned,
      updatedAt,
    };
  }

  public archiveConversation(
    conversationId: string,
    auth: AuthContext
  ): ConversationRecord {
    const conv = this.getConversation(conversationId, auth);
    const updatedAt = new Date().toISOString();
    this.database.db
      .prepare(`UPDATE conversations SET status = 'archived', updated_at = ? WHERE id = ?`)
      .run(updatedAt, conv.id);

    return {
      ...conv,
      status: 'archived',
      updatedAt,
    };
  }

  public deleteConversation(conversationId: string, auth: AuthContext): boolean {
    const conv = this.getConversation(conversationId, auth);
    const res = this.database.db
      .prepare(`DELETE FROM conversations WHERE id = ? AND org_id = ?`)
      .run(conv.id, auth.orgId);

    this.audit.record({
      orgId: auth.orgId,
      actorUserId: auth.userId,
      action: 'conversation.deleted',
      resourceType: 'conversation',
      resourceId: conv.id,
      outcome: 'success',
    });

    return Number(res.changes) > 0;
  }

  public appendMessage(params: {
    conversationId: string;
    auth: AuthContext;
    role: ConversationMessageRecord['role'];
    content: string;
    attachments?: AttachmentReference[];
    provider?: ProviderName | null;
    modelId?: string | null;
    status?: ConversationMessageRecord['status'];
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    costUsd?: number;
    latencyMs?: number;
    interruptedAtChar?: number | null;
    metadata?: Record<string, unknown>;
  }): ConversationMessageRecord {
    const conv = this.getConversation(params.conversationId, params.auth);
    const id = generateId('msg');
    const now = new Date().toISOString();

    return this.database.transaction(() => {
      const seqRow = this.database.db
        .prepare(
          `SELECT COALESCE(MAX(sequence_num), 0) AS max_seq
           FROM messages WHERE conversation_id = ?`
        )
        .get(conv.id) as { max_seq: number };
      const sequenceNum = Number(seqRow.max_seq || 0) + 1;

      // Strip bulky base64 payloads when storing attachment metadata in message rows
      const lightweightAttachments = (params.attachments || []).map((a) => ({
        fileId: a.fileId,
        modality: a.modality,
        mimeType: a.mimeType,
        originalName: a.originalName,
        sizeBytes: a.sizeBytes,
        extractedText: a.extractedText ?? null,
      }));

      this.database.db
        .prepare(
          `INSERT INTO messages (
            id, conversation_id, org_id, user_id, sequence_num, role, content,
            attachments_json, provider, model_id, status, input_tokens,
            output_tokens, cached_tokens, cost_usd, latency_ms,
            interrupted_at_char, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          conv.id,
          conv.orgId,
          params.auth.userId,
          sequenceNum,
          params.role,
          params.content,
          JSON.stringify(lightweightAttachments),
          params.provider ?? null,
          params.modelId ?? null,
          params.status ?? 'completed',
          params.inputTokens ?? 0,
          params.outputTokens ?? 0,
          params.cachedTokens ?? 0,
          params.costUsd ?? 0,
          params.latencyMs ?? 0,
          params.interruptedAtChar ?? null,
          JSON.stringify(params.metadata || {}),
          now
        );

      this.database.db
        .prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`)
        .run(now, conv.id);

      return {
        id,
        conversationId: conv.id,
        orgId: conv.orgId,
        userId: params.auth.userId,
        sequenceNum,
        role: params.role,
        content: params.content,
        attachments: lightweightAttachments,
        provider: params.provider ?? null,
        modelId: params.modelId ?? null,
        status: params.status ?? 'completed',
        inputTokens: params.inputTokens ?? 0,
        outputTokens: params.outputTokens ?? 0,
        cachedTokens: params.cachedTokens ?? 0,
        costUsd: params.costUsd ?? 0,
        latencyMs: params.latencyMs ?? 0,
        interruptedAtChar: params.interruptedAtChar ?? null,
        metadata: params.metadata || {},
        createdAt: now,
      };
    });
  }

  public getMessageHistory(
    conversationId: string,
    auth: AuthContext,
    limit = 100
  ): ConversationMessageRecord[] {
    this.getConversation(conversationId, auth);
    const rows = this.database.db
      .prepare(
        `SELECT * FROM messages
         WHERE conversation_id = ? AND org_id = ?
         ORDER BY sequence_num ASC
         LIMIT ?`
      )
      .all(conversationId, auth.orgId, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapMessageRow(r));
  }

  /**
   * Builds a bounded context window for model inference:
   * - Never sends an unlimited conversation history to models.
   * - Compacts older turns beyond `maxRecentMessages` or `maxContextTokens` into a
   *   persistent rolling summary (`summary_context`) stored on the conversation record.
   */
  public buildBoundedContextWindow(params: {
    conversationId: string;
    auth: AuthContext;
    maxContextTokens?: number;
    maxRecentMessages?: number;
    systemPrompt?: string;
  }): {
    contextMessages: ChatMessageInput[];
    summaryApplied: boolean;
    totalContextTokens: number;
    omittedMessageCount: number;
  } {
    const conv = this.getConversation(params.conversationId, params.auth);
    const allMessages = this.getMessageHistory(params.conversationId, params.auth, 500);
    const maxContextTokens = params.maxContextTokens ?? 4000;
    const maxRecentMessages = params.maxRecentMessages ?? 10;

    let summaryContext = conv.summaryContext;
    let summarisedUpToSeq = conv.summarisedUpToSequence;

    // If total messages exceed maxRecentMessages, summarise the older prefix
    if (allMessages.length > maxRecentMessages) {
      const splitIdx = allMessages.length - maxRecentMessages;
      const olderToSummarise = allMessages
        .slice(0, splitIdx)
        .filter((m) => m.sequenceNum > summarisedUpToSeq);

      if (olderToSummarise.length > 0) {
        const bulletPoints = olderToSummarise.map((m) => {
          const snippet = m.content.replace(/\s+/g, ' ').trim().slice(0, 140);
          return `- [Turn ${m.sequenceNum} ${m.role}]: ${snippet}`;
        });
        const newSummaryBlock = bulletPoints.join('\n');
        summaryContext = summaryContext
          ? `${summaryContext}\n${newSummaryBlock}`.slice(-2000)
          : newSummaryBlock.slice(-2000);
        summarisedUpToSeq = olderToSummarise[olderToSummarise.length - 1].sequenceNum;

        this.database.db
          .prepare(
            `UPDATE conversations
             SET summary_context = ?, summarised_up_to_sequence = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(summaryContext, summarisedUpToSeq, new Date().toISOString(), conv.id);
      }
    }

    const recentCandidates = allMessages.filter((m) => m.sequenceNum > summarisedUpToSeq);
    const selectedTail: ChatMessageInput[] = [];
    let runningTokens = 0;

    const systemParts: string[] = [];
    if (params.systemPrompt) {
      systemParts.push(params.systemPrompt);
    }
    if (summaryContext) {
      systemParts.push(
        `[Earlier Conversation Context Summary (Turns 1..${summarisedUpToSeq})]:\n${summaryContext}`
      );
    }
    const combinedSystem = systemParts.join('\n\n');
    if (combinedSystem) {
      runningTokens += estimateTokenCount(combinedSystem);
    }

    // Select from most recent backwards until token budget is reached
    for (let i = recentCandidates.length - 1; i >= 0; i--) {
      const msg = recentCandidates[i];
      const msgTokens = estimateTokenCount(msg.content);
      if (selectedTail.length > 0 && runningTokens + msgTokens > maxContextTokens) {
        break;
      }
      runningTokens += msgTokens;
      selectedTail.unshift({
        role: msg.role,
        content: msg.content,
        attachments: msg.attachments.length > 0 ? msg.attachments : undefined,
      });
    }

    const contextMessages: ChatMessageInput[] = [];
    if (combinedSystem) {
      contextMessages.push({
        role: 'system',
        content: combinedSystem,
      });
    }
    contextMessages.push(...selectedTail);

    return {
      contextMessages,
      summaryApplied: Boolean(summaryContext),
      totalContextTokens: runningTokens,
      omittedMessageCount: Math.max(0, allMessages.length - selectedTail.length),
    };
  }

  private mapConversationRow(row: Record<string, unknown>): ConversationRecord {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      userId: String(row.user_id),
      title: String(row.title),
      status: String(row.status) as ConversationRecord['status'],
      summaryContext: String(row.summary_context || ''),
      summarisedUpToSequence: Number(row.summarised_up_to_sequence || 0),
      metadata: JSON.parse(String(row.metadata_json || '{}')),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapMessageRow(row: Record<string, unknown>): ConversationMessageRecord {
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      orgId: String(row.org_id),
      userId: String(row.user_id),
      sequenceNum: Number(row.sequence_num),
      role: String(row.role) as ConversationMessageRecord['role'],
      content: String(row.content),
      attachments: JSON.parse(String(row.attachments_json || '[]')),
      provider: row.provider ? (String(row.provider) as ProviderName) : null,
      modelId: row.model_id ? String(row.model_id) : null,
      status: String(row.status) as ConversationMessageRecord['status'],
      inputTokens: Number(row.input_tokens || 0),
      outputTokens: Number(row.output_tokens || 0),
      cachedTokens: Number(row.cached_tokens || 0),
      costUsd: Number(row.cost_usd || 0),
      latencyMs: Number(row.latency_ms || 0),
      interruptedAtChar:
        row.interrupted_at_char !== null && row.interrupted_at_char !== undefined
          ? Number(row.interrupted_at_char)
          : null,
      metadata: JSON.parse(String(row.metadata_json || '{}')),
      createdAt: String(row.created_at),
    };
  }
}
