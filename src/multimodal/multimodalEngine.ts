// ============================================================================
// GRIOT AI — MULTIMODAL FOUNDATION & PRIVATE FILE VAULT ENGINE
// Supports Text, Images, PDFs, Documents, Audio, Voice Transcription,
// Voice Generation, and Video Understanding with decoupled processing adapters
// and strict private storage (never exposed via public URLs).
// ============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { GriotDatabase } from '../db/database.ts';
import type { AuditAndRetentionService } from '../security/auditAndRetention.ts';
import {
  generateId,
  signInternalFileToken,
  verifyInternalFileToken,
} from '../security/crypto.ts';
import { inspectAndSanitizeUntrustedText } from '../security/promptGuard.ts';
import type {
  AttachmentReference,
  ModalityType,
  ModelRegistryEntry,
} from '../types/domain.ts';

export interface MultimodalFileRecord {
  id: string;
  orgId: string;
  workspaceId: string | null;
  uploadedByUserId: string;
  originalName: string;
  mimeType: string;
  modality: ModalityType;
  sizeBytes: number;
  sha256Hash: string;
  extractedText: string | null;
  metadata: Record<string, unknown>;
  status: 'ready' | 'processing' | 'failed';
  createdAt: string;
  expiresAt: string | null;
}

export interface DocumentExtractionAdapter {
  extractText(buffer: Buffer, mimeType: string, originalName: string): Promise<string | null>;
}

export interface VoiceTranscriptionAdapter {
  transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    languageHint?: string
  ): Promise<{ transcript: string; durationSeconds: number; provider: string }>;
}

export interface VoiceGenerationAdapter {
  synthesize(
    text: string,
    voiceId?: string
  ): Promise<{ audioBuffer: Buffer; mimeType: string; durationSeconds: number; provider: string }>;
}

const MIME_TO_MODALITY: Record<string, { modality: ModalityType; maxBytes: number }> = {
  'text/plain': { modality: 'text', maxBytes: 10 * 1024 * 1024 },
  'text/markdown': { modality: 'text', maxBytes: 10 * 1024 * 1024 },
  'text/csv': { modality: 'document', maxBytes: 15 * 1024 * 1024 },
  'application/json': { modality: 'document', maxBytes: 10 * 1024 * 1024 },
  'application/pdf': { modality: 'pdf', maxBytes: 25 * 1024 * 1024 },
  'application/msword': { modality: 'document', maxBytes: 20 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    modality: 'document',
    maxBytes: 20 * 1024 * 1024,
  },
  'image/png': { modality: 'image', maxBytes: 15 * 1024 * 1024 },
  'image/jpeg': { modality: 'image', maxBytes: 15 * 1024 * 1024 },
  'image/webp': { modality: 'image', maxBytes: 15 * 1024 * 1024 },
  'image/gif': { modality: 'image', maxBytes: 15 * 1024 * 1024 },
  'audio/mpeg': { modality: 'audio', maxBytes: 30 * 1024 * 1024 },
  'audio/mp3': { modality: 'audio', maxBytes: 30 * 1024 * 1024 },
  'audio/wav': { modality: 'audio', maxBytes: 40 * 1024 * 1024 },
  'audio/ogg': { modality: 'audio', maxBytes: 30 * 1024 * 1024 },
  'audio/webm': { modality: 'audio', maxBytes: 30 * 1024 * 1024 },
  'video/mp4': { modality: 'video', maxBytes: 50 * 1024 * 1024 },
  'video/webm': { modality: 'video', maxBytes: 50 * 1024 * 1024 },
};

export class DefaultDocumentExtractionAdapter implements DocumentExtractionAdapter {
  public async extractText(
    buffer: Buffer,
    mimeType: string,
    _originalName: string
  ): Promise<string | null> {
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json'
    ) {
      const raw = buffer.toString('utf8');
      return inspectAndSanitizeUntrustedText(raw, { isExternalDocument: true }).sanitizedContent;
    }
    if (mimeType === 'application/pdf') {
      // Extract readable ASCII/UTF-8 text streams from simple PDF buffers if present
      const asText = buffer.toString('latin1');
      const matches = asText.match(/\(([^()]{3,200})\)/g);
      if (matches && matches.length > 0) {
        const joined = matches
          .map((m) => m.slice(1, -1))
          .join(' ')
          .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
          .trim();
        if (joined.length > 0) {
          return inspectAndSanitizeUntrustedText(joined, { isExternalDocument: true })
            .sanitizedContent;
        }
      }
      return null;
    }
    return null;
  }
}

export class MultimodalEngine {
  private readonly database: GriotDatabase;
  private readonly audit: AuditAndRetentionService;
  private readonly privateStorageDir: string;
  private readonly fileSigningSecret: string;
  private docExtractor: DocumentExtractionAdapter;
  private voiceTranscriber: VoiceTranscriptionAdapter | null = null;
  private voiceGenerator: VoiceGenerationAdapter | null = null;

  constructor(params: {
    database: GriotDatabase;
    audit: AuditAndRetentionService;
    privateStorageDir: string;
    fileSigningSecret: string;
    docExtractor?: DocumentExtractionAdapter;
  }) {
    this.database = params.database;
    this.audit = params.audit;
    this.privateStorageDir = path.resolve(params.privateStorageDir);
    this.fileSigningSecret = params.fileSigningSecret;
    this.docExtractor = params.docExtractor ?? new DefaultDocumentExtractionAdapter();

    if (!fs.existsSync(this.privateStorageDir)) {
      fs.mkdirSync(this.privateStorageDir, { recursive: true });
    }
  }

  public registerDocumentExtractor(adapter: DocumentExtractionAdapter): void {
    this.docExtractor = adapter;
  }

  public registerVoiceTranscriber(adapter: VoiceTranscriptionAdapter): void {
    this.voiceTranscriber = adapter;
  }

  public registerVoiceGenerator(adapter: VoiceGenerationAdapter): void {
    this.voiceGenerator = adapter;
  }

  public async storePrivateFile(params: {
    orgId: string;
    workspaceId?: string | null;
    userId: string;
    originalName: string;
    mimeType: string;
    contentBuffer: Buffer;
    metadata?: Record<string, unknown>;
    expiresInSeconds?: number;
  }): Promise<MultimodalFileRecord> {
    const cleanMime = params.mimeType.toLowerCase().split(';')[0].trim();
    const spec = MIME_TO_MODALITY[cleanMime];
    if (!spec) {
      throw new Error(`Unsupported file MIME type: '${cleanMime}'`);
    }
    if (params.contentBuffer.byteLength === 0) {
      throw new Error('Cannot upload an empty file.');
    }
    if (params.contentBuffer.byteLength > spec.maxBytes) {
      throw new Error(
        `File size (${params.contentBuffer.byteLength} bytes) exceeds limit for ${spec.modality} (${spec.maxBytes} bytes).`
      );
    }

    const fileId = generateId('file');
    const sha256Hash = crypto
      .createHash('sha256')
      .update(params.contentBuffer)
      .digest('hex');

    // Store strictly inside private vault directory partitioned by orgId
    const orgVaultDir = path.join(this.privateStorageDir, params.orgId);
    if (!fs.existsSync(orgVaultDir)) {
      fs.mkdirSync(orgVaultDir, { recursive: true });
    }
    const storageRelPath = path.join(params.orgId, `${fileId}.vault`);
    const absVaultPath = path.join(this.privateStorageDir, storageRelPath);
    fs.writeFileSync(absVaultPath, params.contentBuffer, { mode: 0o600 });

    const extractedText = await this.docExtractor.extractText(
      params.contentBuffer,
      cleanMime,
      params.originalName
    );

    const createdAt = new Date().toISOString();
    const expiresAt = params.expiresInSeconds
      ? new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
      : null;

    this.database.db
      .prepare(
        `INSERT INTO files (
          id, org_id, workspace_id, uploaded_by_user_id, original_name,
          mime_type, modality, size_bytes, sha256_hash, storage_rel_path,
          extracted_text, metadata_json, status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`
      )
      .run(
        fileId,
        params.orgId,
        params.workspaceId ?? null,
        params.userId,
        params.originalName,
        cleanMime,
        spec.modality,
        params.contentBuffer.byteLength,
        sha256Hash,
        storageRelPath,
        extractedText,
        JSON.stringify(params.metadata || {}),
        createdAt,
        expiresAt
      );

    this.audit.record({
      orgId: params.orgId,
      actorUserId: params.userId,
      action: 'file.uploaded_private',
      resourceType: 'file',
      resourceId: fileId,
      outcome: 'success',
      details: {
        originalName: params.originalName,
        mimeType: cleanMime,
        modality: spec.modality,
        sizeBytes: params.contentBuffer.byteLength,
        sha256Hash,
      },
    });

    return {
      id: fileId,
      orgId: params.orgId,
      workspaceId: params.workspaceId ?? null,
      uploadedByUserId: params.userId,
      originalName: params.originalName,
      mimeType: cleanMime,
      modality: spec.modality,
      sizeBytes: params.contentBuffer.byteLength,
      sha256Hash,
      extractedText,
      metadata: params.metadata || {},
      status: 'ready',
      createdAt,
      expiresAt,
    };
  }

  public getFileMetadata(fileId: string, orgId: string): MultimodalFileRecord {
    const row = this.database.db
      .prepare(`SELECT * FROM files WHERE id = ?`)
      .get(fileId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`File '${fileId}' not found.`);
    }
    if (String(row.org_id) !== orgId) {
      throw new Error(
        `Tenant isolation violation: file '${fileId}' belongs to a different organisation.`
      );
    }

    return {
      id: String(row.id),
      orgId: String(row.org_id),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      uploadedByUserId: String(row.uploaded_by_user_id),
      originalName: String(row.original_name),
      mimeType: String(row.mime_type),
      modality: String(row.modality) as ModalityType,
      sizeBytes: Number(row.size_bytes),
      sha256Hash: String(row.sha256_hash),
      extractedText: row.extracted_text ? String(row.extracted_text) : null,
      metadata: JSON.parse(String(row.metadata_json || '{}')),
      status: String(row.status) as MultimodalFileRecord['status'],
      createdAt: String(row.created_at),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
    };
  }

  /**
   * Generates a short-lived signed internal access token (never a public URL).
   */
  public issueSignedAccessReference(params: {
    fileId: string;
    orgId: string;
    userId: string;
    ttlSeconds?: number;
  }): { internalPath: string; token: string; expiresAtUnix: number } {
    // Verify tenant ownership before issuing token
    this.getFileMetadata(params.fileId, params.orgId);
    const expiresAtUnix = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? 300);
    const token = signInternalFileToken(
      {
        fileId: params.fileId,
        orgId: params.orgId,
        userId: params.userId,
        expiresAtUnix,
      },
      this.fileSigningSecret
    );
    return {
      internalPath: `/api/v1/files/${params.fileId}/content?token=${encodeURIComponent(token)}`,
      token,
      expiresAtUnix,
    };
  }

  public readPrivateFileWithToken(
    fileId: string,
    token: string,
    requesterOrgId: string
  ): { record: MultimodalFileRecord; buffer: Buffer } {
    const verified = verifyInternalFileToken(token, this.fileSigningSecret);
    if (verified.fileId !== fileId || verified.orgId !== requesterOrgId) {
      throw new Error('File access token does not match requested file or organisation.');
    }
    const row = this.database.db
      .prepare(`SELECT * FROM files WHERE id = ? AND org_id = ?`)
      .get(fileId, requesterOrgId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error('File not found in organisation vault.');
    }
    const absPath = path.join(this.privateStorageDir, String(row.storage_rel_path));
    if (!fs.existsSync(absPath)) {
      throw new Error('Underlying private file payload not found on disk.');
    }
    return {
      record: this.getFileMetadata(fileId, requesterOrgId),
      buffer: fs.readFileSync(absPath),
    };
  }

  /**
   * Resolves file IDs into AttachmentReferences for model orchestration, enforcing tenant ownership.
   */
  public resolveAttachmentsForOrchestration(
    orgId: string,
    fileIds: string[]
  ): AttachmentReference[] {
    return fileIds.map((fileId) => {
      const row = this.database.db
        .prepare(`SELECT * FROM files WHERE id = ?`)
        .get(fileId) as Record<string, unknown> | undefined;

      if (!row) {
        throw new Error(`Attached file '${fileId}' does not exist.`);
      }
      if (String(row.org_id) !== orgId) {
        throw new Error(
          `Tenant isolation violation: cannot attach file '${fileId}' from another organisation.`
        );
      }

      const absPath = path.join(this.privateStorageDir, String(row.storage_rel_path));
      const modality = String(row.modality) as ModalityType;
      let inlineBase64: string | undefined;
      if (
        fs.existsSync(absPath) &&
        (modality === 'image' || modality === 'pdf' || modality === 'audio' || modality === 'video')
      ) {
        inlineBase64 = fs.readFileSync(absPath).toString('base64');
      }

      return {
        fileId: String(row.id),
        modality,
        mimeType: String(row.mime_type),
        originalName: String(row.original_name),
        sizeBytes: Number(row.size_bytes),
        extractedText: row.extracted_text ? String(row.extracted_text) : null,
        inlineBase64,
      };
    });
  }

  /**
   * Hard capability gate ensuring a model supports every attachment modality before invocation.
   */
  public assertModelSupportsAttachments(
    model: ModelRegistryEntry,
    attachments: AttachmentReference[]
  ): void {
    for (const att of attachments) {
      if (!model.supportedModalities.input.includes(att.modality)) {
        throw new Error(
          `Capability check failed: Model '${model.id}' does not support input modality '${att.modality}' required by attachment '${att.originalName}'.`
        );
      }
    }
  }

  public async transcribeAudioFile(params: {
    fileId: string;
    orgId: string;
    languageHint?: string;
  }): Promise<{ transcript: string; durationSeconds: number; provider: string }> {
    if (!this.voiceTranscriber) {
      throw new Error('No VoiceTranscriptionAdapter is currently registered.');
    }
    const row = this.database.db
      .prepare(`SELECT * FROM files WHERE id = ? AND org_id = ?`)
      .get(params.fileId, params.orgId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Audio file '${params.fileId}' not found in organisation.`);
    }
    const absPath = path.join(this.privateStorageDir, String(row.storage_rel_path));
    const buffer = fs.readFileSync(absPath);
    return this.voiceTranscriber.transcribe(
      buffer,
      String(row.mime_type),
      params.languageHint
    );
  }

  public async synthesizeVoice(params: {
    text: string;
    voiceId?: string;
  }): Promise<{ audioBuffer: Buffer; mimeType: string; durationSeconds: number; provider: string }> {
    if (!this.voiceGenerator) {
      throw new Error('No VoiceGenerationAdapter is currently registered.');
    }
    return this.voiceGenerator.synthesize(params.text, params.voiceId);
  }
}
