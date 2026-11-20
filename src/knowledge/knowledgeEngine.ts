// ============================================================================
// GRIOT AI — KNOWLEDGE AND PERMISSION-AWARE RETRIEVAL (RAG) ENGINE
// Supports multi-tenant knowledge bases, permission-verified document ingestion,
// semantic chunking, vector embeddings, hybrid cosine + lexical retrieval,
// metadata filtering, and source citations.
// ============================================================================

import type { GriotDatabase } from '../db/database.ts';
import { estimateTokenCount } from '../providers/adapter.ts';
import type { AuditAndRetentionService } from '../security/auditAndRetention.ts';
import { generateId } from '../security/crypto.ts';
import {
  inspectAndSanitizeUntrustedText,
  wrapUntrustedDocumentContext,
} from '../security/promptGuard.ts';
import type { AuthContext, OrgRole } from '../types/domain.ts';

export type KnowledgeSourceType =
  | 'business_document'
  | 'internal_database'
  | 'approved_website'
  | 'external_api'
  | 'uploaded_file'
  | 'institutional_knowledge';

export interface KnowledgeBase {
  id: string;
  orgId: string;
  workspaceId: string | null;
  createdByUserId: string;
  name: string;
  description: string;
  visibility: 'organisation' | 'workspace' | 'restricted';
  allowedRoles: OrgRole[];
  allowedUserIds: string[];
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  createdAt: string;
}

export interface RetrievedChunkResult {
  chunkId: string;
  kbId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  similarityScore: number;
  metadata: Record<string, unknown>;
  sourceReference: {
    documentId: string;
    title: string;
    sourceType: KnowledgeSourceType;
    sourceUri: string;
    chunkIndex: number;
  };
}

export type EmbeddingGeneratorFn = (texts: string[]) => Promise<number[][]>;

/**
 * Deterministic 128-dimensional L2-normalized semantic feature-hashing embedder.
 * Ensures fast, reproducible vector cosine similarity for local execution & tests
 * while supporting seamless swap-in of OpenAI/Mistral embedding models.
 */
export function computeDeterministicEmbedding(text: string, dims = 128): number[] {
  const vec = new Float64Array(dims);
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  for (let i = 0; i < normalized.length; i++) {
    const token = normalized[i];
    // Unigram + character trigram hashing
    const features = [token];
    if (i + 1 < normalized.length) {
      features.push(`${token}_${normalized[i + 1]}`);
    }
    for (let c = 0; c <= token.length - 3; c++) {
      features.push(token.slice(c, c + 3));
    }
    for (const feat of features) {
      let h = 2166136261;
      for (let j = 0; j < feat.length; j++) {
        h ^= feat.charCodeAt(j);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % dims;
      const sign = (h & 1) === 0 ? 1 : -1;
      vec[idx] += sign;
    }
  }

  let norm = 0;
  for (let i = 0; i < dims; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1;
  const out = new Array<number>(dims);
  for (let i = 0; i < dims; i++) {
    out[i] = Number((vec[i] / norm).toFixed(6));
  }
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class KnowledgeEngine {
  private readonly database: GriotDatabase;
  private readonly audit: AuditAndRetentionService;
  private customEmbedder: EmbeddingGeneratorFn | null = null;

  constructor(database: GriotDatabase, audit: AuditAndRetentionService) {
    this.database = database;
    this.audit = audit;
  }

  public setCustomEmbeddingGenerator(fn: EmbeddingGeneratorFn): void {
    this.customEmbedder = fn;
  }

  public createKnowledgeBase(params: {
    orgId: string;
    workspaceId?: string | null;
    createdByUserId: string;
    name: string;
    description?: string;
    visibility?: KnowledgeBase['visibility'];
    allowedRoles?: OrgRole[];
    allowedUserIds?: string[];
    chunkSize?: number;
    chunkOverlap?: number;
  }): KnowledgeBase {
    const id = generateId('kb');
    const createdAt = new Date().toISOString();
    const visibility = params.visibility ?? 'organisation';
    const allowedRoles: OrgRole[] = params.allowedRoles ?? [
      'owner',
      'admin',
      'developer',
      'member',
      'viewer',
    ];
    const allowedUserIds = params.allowedUserIds ?? [];
    const chunkSize = Math.max(100, params.chunkSize ?? 600);
    const chunkOverlap = Math.max(0, Math.min(chunkSize - 50, params.chunkOverlap ?? 100));

    this.database.db
      .prepare(
        `INSERT INTO knowledge_bases (
          id, org_id, workspace_id, created_by_user_id, name, description,
          visibility, allowed_roles_json, allowed_user_ids_json,
          embedding_model, chunk_size, chunk_overlap, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local:deterministic-128', ?, ?, ?)`
      )
      .run(
        id,
        params.orgId,
        params.workspaceId ?? null,
        params.createdByUserId,
        params.name,
        params.description ?? '',
        visibility,
        JSON.stringify(allowedRoles),
        JSON.stringify(allowedUserIds),
        chunkSize,
        chunkOverlap,
        createdAt
      );

    this.audit.record({
      orgId: params.orgId,
      actorUserId: params.createdByUserId,
      action: 'knowledge_base.created',
      resourceType: 'knowledge_base',
      resourceId: id,
      outcome: 'success',
      details: { name: params.name, visibility, allowedRoles },
    });

    return {
      id,
      orgId: params.orgId,
      workspaceId: params.workspaceId ?? null,
      createdByUserId: params.createdByUserId,
      name: params.name,
      description: params.description ?? '',
      visibility,
      allowedRoles,
      allowedUserIds,
      embeddingModel: 'local:deterministic-128',
      chunkSize,
      chunkOverlap,
      createdAt,
    };
  }

  public getKnowledgeBase(kbId: string): KnowledgeBase | null {
    const row = this.database.db
      .prepare(`SELECT * FROM knowledge_bases WHERE id = ?`)
      .get(kbId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapKbRow(row);
  }

  public listKnowledgeBases(orgId: string): KnowledgeBase[] {
    const rows = this.database.db
      .prepare(`SELECT * FROM knowledge_bases WHERE org_id = ? ORDER BY created_at DESC`)
      .all(orgId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapKbRow(r));
  }

  /**
   * Enforces tenant, workspace, role, and user permissions on a knowledge base.
   */
  public assertUserCanAccessKnowledgeBase(kbId: string, auth: AuthContext): KnowledgeBase {
    const kb = this.getKnowledgeBase(kbId);
    if (!kb) {
      throw new Error(`Knowledge base '${kbId}' not found.`);
    }
    if (kb.orgId !== auth.orgId) {
      this.audit.record({
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: 'knowledge_base.cross_tenant_denied',
        resourceType: 'knowledge_base',
        resourceId: kbId,
        outcome: 'denied',
        details: { targetKbOrgId: kb.orgId },
      });
      throw new Error(
        `Tenant isolation violation: knowledge base '${kbId}' belongs to another organisation.`
      );
    }

    if (
      kb.visibility === 'workspace' &&
      kb.workspaceId &&
      auth.workspaceId !== kb.workspaceId
    ) {
      throw new Error(
        `Workspace permission denied: knowledge base '${kbId}' is restricted to workspace '${kb.workspaceId}'.`
      );
    }

    const roleAllowed = kb.allowedRoles.includes(auth.role);
    const userExplicitlyAllowed = kb.allowedUserIds.includes(auth.userId);

    if (kb.visibility === 'restricted' && !userExplicitlyAllowed && auth.role !== 'owner') {
      throw new Error(
        `Access denied: user '${auth.userId}' is not on the restricted ACL for knowledge base '${kbId}'.`
      );
    }
    if (!roleAllowed && !userExplicitlyAllowed) {
      throw new Error(
        `Role '${auth.role}' is not authorised to access knowledge base '${kbId}'.`
      );
    }

    return kb;
  }

  public chunkDocumentText(
    rawText: string,
    chunkSize = 600,
    chunkOverlap = 100
  ): string[] {
    const sanitized = inspectAndSanitizeUntrustedText(rawText, {
      isExternalDocument: true,
    }).sanitizedContent.trim();

    if (!sanitized) return [];
    if (sanitized.length <= chunkSize) return [sanitized];

    const chunks: string[] = [];
    let start = 0;
    const step = Math.max(50, chunkSize - chunkOverlap);

    while (start < sanitized.length) {
      let end = Math.min(sanitized.length, start + chunkSize);
      if (end < sanitized.length) {
        // Prefer breaking at paragraph or sentence boundary
        const lastBreak = Math.max(
          sanitized.lastIndexOf('\n\n', end),
          sanitized.lastIndexOf('. ', end),
          sanitized.lastIndexOf('\n', end)
        );
        if (lastBreak > start + Math.floor(chunkSize * 0.5)) {
          end = lastBreak + 1;
        }
      }
      const slice = sanitized.slice(start, end).trim();
      if (slice.length > 0) {
        chunks.push(slice);
      }
      if (end >= sanitized.length) break;
      start += step;
    }

    return chunks;
  }

  public async ingestDocument(params: {
    kbId: string;
    auth: AuthContext;
    title: string;
    sourceType: KnowledgeSourceType;
    sourceUri: string;
    content: string;
    mimeType?: string;
    permissionVerified: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<{
    documentId: string;
    kbId: string;
    chunkCount: number;
    title: string;
  }> {
    // Rule: Do not ingest external data without appropriate permission
    if (!params.permissionVerified) {
      this.audit.record({
        orgId: params.auth.orgId,
        actorUserId: params.auth.userId,
        action: 'knowledge_document.unverified_ingestion_blocked',
        resourceType: 'knowledge_base',
        resourceId: params.kbId,
        outcome: 'denied',
        details: { sourceType: params.sourceType, sourceUri: params.sourceUri },
      });
      throw new Error(
        'Ingestion rejected: external or document data cannot be ingested without explicit permission verification (permissionVerified=true).'
      );
    }

    const kb = this.assertUserCanAccessKnowledgeBase(params.kbId, params.auth);
    const chunks = this.chunkDocumentText(params.content, kb.chunkSize, kb.chunkOverlap);
    if (chunks.length === 0) {
      throw new Error('Cannot ingest document with empty extractable text.');
    }

    const embeddings = this.customEmbedder
      ? await this.customEmbedder(chunks)
      : chunks.map((c) => computeDeterministicEmbedding(c));

    const docId = generateId('kdoc');
    const createdAt = new Date().toISOString();
    const docMeta = params.metadata || {};

    this.database.transaction(() => {
      this.database.db
        .prepare(
          `INSERT INTO knowledge_documents (
            id, kb_id, org_id, source_type, source_uri, title,
            mime_type, permission_verified, metadata_json, chunk_count, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'indexed', ?)`
        )
        .run(
          docId,
          kb.id,
          kb.orgId,
          params.sourceType,
          params.sourceUri,
          params.title,
          params.mimeType ?? 'text/plain',
          JSON.stringify(docMeta),
          chunks.length,
          createdAt
        );

      const insertChunk = this.database.db.prepare(
        `INSERT INTO knowledge_chunks (
          id, doc_id, kb_id, org_id, chunk_index, content,
          token_count, embedding_json, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const emb = embeddings[i] || computeDeterministicEmbedding(chunkText);
        insertChunk.run(
          generateId('kchk'),
          docId,
          kb.id,
          kb.orgId,
          i,
          chunkText,
          estimateTokenCount(chunkText),
          JSON.stringify(emb),
          JSON.stringify(docMeta),
          createdAt
        );
      }
    });

    this.audit.record({
      orgId: kb.orgId,
      actorUserId: params.auth.userId,
      action: 'knowledge_document.ingested',
      resourceType: 'knowledge_document',
      resourceId: docId,
      outcome: 'success',
      details: {
        kbId: kb.id,
        title: params.title,
        sourceType: params.sourceType,
        chunkCount: chunks.length,
      },
    });

    return {
      documentId: docId,
      kbId: kb.id,
      chunkCount: chunks.length,
      title: params.title,
    };
  }

  public async retrieve(params: {
    kbIds: string[];
    auth: AuthContext;
    query: string;
    topK?: number;
    metadataFilter?: Record<string, unknown>;
    minScore?: number;
  }): Promise<RetrievedChunkResult[]> {
    if (!params.kbIds || params.kbIds.length === 0) return [];

    // Enforce tenant & user permission on every requested Knowledge Base BEFORE querying chunks
    for (const kbId of params.kbIds) {
      this.assertUserCanAccessKnowledgeBase(kbId, params.auth);
    }

    const queryEmbedding = this.customEmbedder
      ? (await this.customEmbedder([params.query]))[0]
      : computeDeterministicEmbedding(params.query);

    const queryTerms = params.query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3);

    const placeholders = params.kbIds.map(() => '?').join(', ');
    const rows = this.database.db
      .prepare(
        `SELECT c.*, d.title AS doc_title, d.source_type, d.source_uri
         FROM knowledge_chunks c
         JOIN knowledge_documents d ON d.id = c.doc_id
         WHERE c.org_id = ? AND c.kb_id IN (${placeholders})`
      )
      .all(params.auth.orgId, ...params.kbIds) as Array<Record<string, unknown>>;

    const candidates: RetrievedChunkResult[] = [];
    const minScore = params.minScore ?? 0.05;

    for (const row of rows) {
      const metadata = JSON.parse(String(row.metadata_json || '{}')) as Record<
        string,
        unknown
      >;
      if (params.metadataFilter) {
        let matchesAll = true;
        for (const [k, expectedVal] of Object.entries(params.metadataFilter)) {
          if (metadata[k] !== expectedVal) {
            matchesAll = false;
            break;
          }
        }
        if (!matchesAll) continue;
      }

      const content = String(row.content);
      const chunkEmb = JSON.parse(String(row.embedding_json || '[]')) as number[];
      const vecSim = cosineSimilarity(queryEmbedding, chunkEmb);

      // Lexical keyword overlap boost
      let lexicalBoost = 0;
      if (queryTerms.length > 0) {
        const lowerContent = content.toLowerCase();
        let matchedTerms = 0;
        for (const term of queryTerms) {
          if (lowerContent.includes(term)) matchedTerms++;
        }
        lexicalBoost = (matchedTerms / queryTerms.length) * 0.35;
      }

      const combinedScore = Number((vecSim * 0.75 + lexicalBoost).toFixed(4));
      if (combinedScore < minScore) continue;

      candidates.push({
        chunkId: String(row.id),
        kbId: String(row.kb_id),
        documentId: String(row.doc_id),
        chunkIndex: Number(row.chunk_index),
        content,
        similarityScore: combinedScore,
        metadata,
        sourceReference: {
          documentId: String(row.doc_id),
          title: String(row.doc_title),
          sourceType: String(row.source_type) as KnowledgeSourceType,
          sourceUri: String(row.source_uri),
          chunkIndex: Number(row.chunk_index),
        },
      });
    }

    candidates.sort((a, b) => b.similarityScore - a.similarityScore);
    return candidates.slice(0, params.topK ?? 5);
  }

  public formatRetrievedContextForPrompt(chunks: RetrievedChunkResult[]): string {
    if (chunks.length === 0) return '';
    const formattedBlocks = chunks.map((c, idx) =>
      wrapUntrustedDocumentContext(
        `[${idx + 1}] ${c.sourceReference.title} (${c.sourceReference.sourceUri}#chunk-${c.chunkIndex})`,
        c.content
      )
    );
    return `Use the following verified organisation knowledge base excerpts to answer accurately and cite sources by title:\n\n${formattedBlocks.join('\n\n')}`;
  }

  private mapKbRow(row: Record<string, unknown>): KnowledgeBase {
    return {
      id: String(row.id),
      orgId: String(row.org_id),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      createdByUserId: String(row.created_by_user_id),
      name: String(row.name),
      description: String(row.description),
      visibility: String(row.visibility) as KnowledgeBase['visibility'],
      allowedRoles: JSON.parse(String(row.allowed_roles_json || '[]')),
      allowedUserIds: JSON.parse(String(row.allowed_user_ids_json || '[]')),
      embeddingModel: String(row.embedding_model),
      chunkSize: Number(row.chunk_size),
      chunkOverlap: Number(row.chunk_overlap),
      createdAt: String(row.created_at),
    };
  }
}
