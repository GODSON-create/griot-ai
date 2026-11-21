// ============================================================================
// GRIOT AI — VERSIONED INTERNAL HTTP & SSE API FOUNDATION (/api/v1/*)
// Provides authentication middleware, organisation context, consistent
// response envelopes, input size enforcement, and provider-independent routes.
// ============================================================================

import http from 'node:http';
import { URL } from 'node:url';
import type {
  BudgetConstraint,
  ProjectCategory,
  TechnicalExperienceLevel,
} from '../builder/toolRegistry.ts';
import { inspectConfiguredCredentials } from '../config/env.ts';
import type { GriotCore } from '../core/griotCore.ts';
import { LocalQueueLimitError } from '../economics/concurrencyLimiter.ts';
import { BudgetExceededError } from '../economics/usageEngine.ts';
import type { KnowledgeSourceType } from '../knowledge/knowledgeEngine.ts';
import { listProductModules } from '../products/productModules.ts';
import { ProviderError } from '../providers/adapter.ts';
import { RoutingConstraintError } from '../routing/routingEngine.ts';
import { AuthError } from '../security/auth.ts';
import { generateId } from '../security/crypto.ts';
import type {
  AccessModelType,
  AuthContext,
  BrandingMode,
  GriotProductModuleId,
  ModalityType,
  ModelAvailability,
  ModelCapability,
  ProviderName,
  UserPreferences,
} from '../types/domain.ts';
import { renderGriotWebInterfaceHtml } from '../ui/griotAppHtml.ts';

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  apiVersion: 'v1';
  requestId: string;
  timestamp: string;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
}

export class GriotHttpServer {
  private readonly core: GriotCore;
  private server: http.Server | null = null;

  constructor(core: GriotCore) {
    this.core = core;
  }

  public createNodeServer(): http.Server {
    this.server = http.createServer(async (req, res) => {
      const requestId = generateId('api');
      res.setHeader('X-Griot-Api-Version', 'v1');
      res.setHeader('X-Griot-Request-Id', requestId);

      try {
        await this.routeRequest(req, res, requestId);
      } catch (err) {
        this.sendError(res, requestId, err);
      }
    });
    return this.server;
  }

  public async listen(port = this.core.config.port, host = this.core.config.host): Promise<number> {
    const srv = this.server ?? this.createNodeServer();
    return new Promise((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(port, host, () => {
        const addr = srv.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : port;
        resolve(actualPort);
      });
    });
  }

  public async close(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.close(() => resolve());
    });
  }

  private sendJson<T>(
    res: http.ServerResponse,
    statusCode: number,
    requestId: string,
    data: T
  ): void {
    const envelope: ApiEnvelope<T> = {
      success: true,
      apiVersion: 'v1',
      requestId,
      timestamp: new Date().toISOString(),
      data,
      error: null,
    };
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(envelope));
  }

  private sendError(
    res: http.ServerResponse,
    requestId: string,
    err: unknown
  ): void {
    if (res.headersSent) {
      res.end();
      return;
    }

    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = err instanceof Error ? err.message : 'Unexpected server error';
    let details: Record<string, unknown> | undefined;

    if (err instanceof AuthError) {
      statusCode = err.statusCode;
      code = err.code;
    } else if (err instanceof LocalQueueLimitError) {
      statusCode = err.statusCode;
      code = err.code;
    } else if (err instanceof BudgetExceededError) {
      statusCode = err.statusCode;
      code = err.code;
      details = { scope: err.scope };
    } else if (err instanceof RoutingConstraintError) {
      statusCode = err.statusCode;
      code = err.code;
      details = err.details;
    } else if (err instanceof ProviderError) {
      statusCode = err.statusCode;
      code = `PROVIDER_${err.category.toUpperCase()}`;
      details = { provider: err.provider, retryable: err.retryable };
    } else if (/not found/i.test(message)) {
      statusCode = 404;
      code = 'NOT_FOUND';
    } else if (
      /invalid|unsupported|empty|exceeds|cannot|rejected|required|malformed/i.test(message)
    ) {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
    }

    const envelope: ApiEnvelope<null> = {
      success: false,
      apiVersion: 'v1',
      requestId,
      timestamp: new Date().toISOString(),
      data: null,
      error: {
        code,
        message,
        details,
      },
    };
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(envelope));
  }

  private async readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const maxBytes = this.core.config.maxRequestBytes;
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.byteLength;
      if (totalBytes > maxBytes) {
        throw new AuthError(
          `Request body exceeds maximum size limit of ${maxBytes} bytes.`,
          413,
          'PAYLOAD_TOO_LARGE'
        );
      }
      chunks.push(buf);
    }

    if (chunks.length === 0) return {};
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('JSON body must be an object');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new Error('Malformed JSON request body.');
    }
  }

  private requireAuth(req: http.IncomingMessage): AuthContext {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : null) ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    return this.core.authService.authenticateHeaders(req.headers, ip);
  }

  private async routeRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestId: string
  ): Promise<void> {
    const method = (req.method || 'GET').toUpperCase();
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

    // 0. Responsive Web Product Interface (ASK GRIOT & BUILD WITH GRIOT)
    if (method === 'GET' && (pathname === '/' || pathname === '/app')) {
      const html = renderGriotWebInterfaceHtml();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // 1. Health, Local Runtime & Product Boundaries Endpoints (Public)
    if (method === 'GET' && pathname === '/api/v1/local-runtime') {
      const ollamaStatus = await this.core.providerManager.inspectLocalOllamaStatus();
      const queueMetrics = this.core.providerManager.localConcurrency.getQueueMetrics();
      const internalRates = this.core.providerManager.localConcurrency.getInternalRates();
      this.sendJson(res, 200, requestId, {
        ollama: ollamaStatus,
        concurrencyAndQueue: queueMetrics,
        internalCostAllocationRates: internalRates,
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/health') {
      const models = this.core.registry.listModels();
      const credentialsSummary = inspectConfiguredCredentials(this.core.config);
      this.sendJson(res, 200, requestId, {
        status: 'healthy',
        service: 'griot-ai-core',
        phase: 1,
        environment: this.core.config.env,
        branding: {
          standalone: 'GRIOT',
          ecosystem: 'GRIOT powered by Avantage',
        },
        accessModels: {
          avantageGroup: 'FREE',
          public: 'FREEMIUM',
          enterprise: 'SHARED_INFRASTRUCTURE_STRICT_ISOLATION',
        },
        registeredModelsCount: models.length,
        availableModelsCount: models.filter((m) => m.availability === 'available').length,
        providersConfigured: credentialsSummary,
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/products') {
      this.sendJson(res, 200, requestId, {
        products: listProductModules(),
      });
      return;
    }

    // 2. Auth Endpoints (Public)
    if (method === 'POST' && pathname === '/api/v1/auth/register') {
      const body = await this.readJsonBody(req);
      const email = String(body.email || '').trim();
      const displayName = String(body.displayName || '').trim();
      const password = String(body.password || '');
      if (!email || !displayName || password.length < 8) {
        throw new Error(
          'Registration requires valid email, displayName, and password (min 8 chars).'
        );
      }
      const created = this.core.tenantService.createUserAccount({
        email,
        displayName,
        password,
        createPersonalOrg: body.createPersonalOrg !== false,
        spendingLimitUsd:
          typeof body.spendingLimitUsd === 'number' ? body.spendingLimitUsd : null,
      });
      this.sendJson(res, 201, requestId, created);
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/login') {
      const body = await this.readJsonBody(req);
      const email = String(body.email || '').trim();
      const password = String(body.password || '');
      const orgId = typeof body.orgId === 'string' ? body.orgId : undefined;
      try {
        const session = this.core.tenantService.authenticateUserLogin({
          email,
          password,
          orgId,
        });
        this.sendJson(res, 200, requestId, session);
      } catch (err) {
        throw new AuthError((err as Error).message, 401, 'INVALID_CREDENTIALS');
      }
      return;
    }

    // All remaining /api/v1/* endpoints require authentication
    if (!pathname.startsWith('/api/v1/')) {
      throw new Error(`Endpoint '${pathname}' not found. Use versioned prefix '/api/v1/...'.`);
    }

    const auth = this.requireAuth(req);

    // 3. Identity & Multi-Organisation Membership / User Preferences Endpoints
    if (method === 'GET' && pathname === '/api/v1/users/me/organisations') {
      const memberships = this.core.tenantService.listUserOrganisations(auth.userId);
      this.sendJson(res, 200, requestId, { memberships });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/users/me/preferences') {
      const preferences = this.core.tenantService.getUserPreferences(auth.userId);
      this.sendJson(res, 200, requestId, { preferences });
      return;
    }

    if (method === 'PATCH' && pathname === '/api/v1/users/me/preferences') {
      const body = (await this.readJsonBody(req)) as UserPreferences;
      const preferences = this.core.tenantService.updateUserPreferences(auth.userId, body);
      this.sendJson(res, 200, requestId, { preferences });
      return;
    }

    // 4. Organisation & Multi-Tenancy Endpoints
    if (method === 'POST' && pathname === '/api/v1/organisations') {
      const body = await this.readJsonBody(req);
      const name = String(body.name || '').trim();
      const slug = String(body.slug || '').trim();
      if (!name || !slug) {
        throw new Error('Organisation creation requires name and slug.');
      }
      const org = this.core.tenantService.createOrganisation({
        name,
        slug,
        isAvantageInternal: Boolean(body.isAvantageInternal),
        accessModel: body.accessModel as AccessModelType | undefined,
        brandingMode: body.brandingMode as BrandingMode | undefined,
        parentGroup: typeof body.parentGroup === 'string' ? body.parentGroup : undefined,
        dataRetentionDays:
          typeof body.dataRetentionDays === 'number' ? body.dataRetentionDays : undefined,
      });
      this.core.tenantService.addMember({
        orgId: org.id,
        userId: auth.userId,
        role: 'owner',
      });
      const token = this.core.tenantService.issueJwtForMember(auth.userId, org.id);
      this.sendJson(res, 201, requestId, { organisation: org, accessToken: token });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/organisations/current') {
      this.core.authService.requireScope(auth, 'org:read');
      const org = this.core.tenantService.getOrganisation(auth.orgId);
      const workspaces = this.core.tenantService.listWorkspaces(auth.orgId);
      const billing = this.core.usageEngine.getBillingAccount(auth.orgId);
      this.sendJson(res, 200, requestId, {
        organisation: org,
        activeWorkspaceId: auth.workspaceId,
        workspaces,
        billing,
      });
      return;
    }

    if (method === 'PATCH' && pathname === '/api/v1/organisations/current/preferences') {
      this.core.authService.requireScope(auth, 'org:admin');
      const body = await this.readJsonBody(req);
      const updated = this.core.tenantService.updateOrganisationPreferences(
        auth.orgId,
        auth.userId,
        body
      );
      this.sendJson(res, 200, requestId, updated);
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/organisations/current/api-keys') {
      this.core.authService.requireScope(auth, 'apikeys:manage');
      const body = await this.readJsonBody(req);
      const name = String(body.name || 'API Key').trim();
      const created = this.core.tenantService.createApiKey({
        orgId: auth.orgId,
        workspaceId:
          typeof body.workspaceId === 'string' ? body.workspaceId : auth.workspaceId,
        createdByUserId: auth.userId,
        name,
        spendingLimitUsd:
          typeof body.spendingLimitUsd === 'number' ? body.spendingLimitUsd : null,
        rateLimitRpm: typeof body.rateLimitRpm === 'number' ? body.rateLimitRpm : 60,
      });
      this.sendJson(res, 201, requestId, created);
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/organisations/current/api-keys') {
      this.core.authService.requireScope(auth, 'org:read');
      this.sendJson(
        res,
        200,
        requestId,
        this.core.tenantService.listApiKeys(auth.orgId)
      );
      return;
    }

    const revokeKeyMatch = pathname.match(
      /^\/api\/v1\/organisations\/current\/api-keys\/([^/]+)$/
    );
    if (method === 'DELETE' && revokeKeyMatch) {
      this.core.authService.requireScope(auth, 'apikeys:manage');
      const revoked = this.core.tenantService.revokeApiKey(
        auth.orgId,
        revokeKeyMatch[1],
        auth.userId
      );
      this.sendJson(res, 200, requestId, { revoked });
      return;
    }

    if (method === 'PUT' && pathname === '/api/v1/organisations/current/provider-credentials') {
      this.core.authService.requireScope(auth, 'org:admin');
      const body = await this.readJsonBody(req);
      const provider = String(body.provider || '') as ProviderName;
      const apiKey = String(body.apiKey || '').trim();
      if (!provider || !apiKey) {
        throw new Error('provider and apiKey are required.');
      }
      const saved = this.core.tenantService.setOrgProviderCredential({
        orgId: auth.orgId,
        actorUserId: auth.userId,
        provider,
        rawApiKey: apiKey,
      });
      this.sendJson(res, 200, requestId, saved);
      return;
    }

    // 5. Model Registry & Routing Selection Endpoints
    if (method === 'GET' && pathname === '/api/v1/models') {
      this.core.authService.requireScope(auth, 'models:read');
      const provider = parsedUrl.searchParams.get('provider') as ProviderName | null;
      const onlyAvailable = parsedUrl.searchParams.get('onlyAvailable') === 'true';
      const capability = parsedUrl.searchParams.get('capability') as ModelCapability | null;
      const modality = parsedUrl.searchParams.get('modality') as ModalityType | null;

      const models = this.core.registry.listModels({
        provider: provider || undefined,
        onlyAvailable,
        requiredCapabilities: capability ? [capability] : undefined,
        requiredInputModalities: modality ? [modality] : undefined,
      });
      this.sendJson(res, 200, requestId, { models });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/models/select') {
      this.core.authService.requireScope(auth, 'models:read');
      const body = await this.readJsonBody(req);
      const prompt = String(body.prompt || '');
      const messages = Array.isArray(body.messages)
        ? (body.messages as Array<{ role: 'user' | 'system' | 'assistant'; content: string }>)
        : [{ role: 'user' as const, content: prompt }];
      const org = this.core.tenantService.getOrganisation(auth.orgId);

      const decision = this.core.routingEngine.selectModel({
        orgId: auth.orgId,
        messages,
        hints: (body.routingHints as Record<string, unknown>) || {},
        orgPreferences: org?.preferences,
      });
      this.sendJson(res, 200, requestId, decision);
      return;
    }

    const modelOverrideMatch = pathname.match(/^\/api\/v1\/models\/([^/]+)$/);
    if (method === 'PATCH' && modelOverrideMatch) {
      this.core.authService.requireScope(auth, 'models:admin');
      const body = await this.readJsonBody(req);
      const modelId = decodeURIComponent(modelOverrideMatch[1]);
      const updated = this.core.registry.updateModelOverride({
        modelId,
        availability: body.availability as ModelAvailability | undefined,
        eligible: typeof body.eligible === 'boolean' ? body.eligible : undefined,
        inputPricingPer1M:
          typeof body.inputPricingPer1M === 'number' ? body.inputPricingPer1M : undefined,
        cachedInputPricingPer1M:
          typeof body.cachedInputPricingPer1M === 'number'
            ? body.cachedInputPricingPer1M
            : undefined,
        outputPricingPer1M:
          typeof body.outputPricingPer1M === 'number' ? body.outputPricingPer1M : undefined,
      });
      this.sendJson(res, 200, requestId, updated);
      return;
    }

    // 6. Conversation & Message Endpoints
    if (method === 'POST' && pathname === '/api/v1/conversations') {
      this.core.authService.requireScope(auth, 'conversations:write');
      const body = await this.readJsonBody(req);
      const conv = this.core.conversationEngine.createConversation({
        auth,
        title: typeof body.title === 'string' ? body.title : undefined,
        metadata:
          typeof body.metadata === 'object' && body.metadata !== null
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      });
      this.sendJson(res, 201, requestId, conv);
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/conversations') {
      this.core.authService.requireScope(auth, 'conversations:read');
      const includeArchived = parsedUrl.searchParams.get('includeArchived') === 'true';
      const list = this.core.conversationEngine.listConversations(auth, {
        includeArchived,
      });
      this.sendJson(res, 200, requestId, { conversations: list });
      return;
    }

    const convMatch = pathname.match(/^\/api\/v1\/conversations\/([^/]+)$/);
    if (convMatch) {
      const convId = convMatch[1];
      if (method === 'GET') {
        this.core.authService.requireScope(auth, 'conversations:read');
        const conv = this.core.conversationEngine.getConversation(convId, auth);
        this.sendJson(res, 200, requestId, conv);
        return;
      }
      if (method === 'PATCH') {
        this.core.authService.requireScope(auth, 'conversations:write');
        const body = await this.readJsonBody(req);
        let updated = this.core.conversationEngine.getConversation(convId, auth);
        if (typeof body.title === 'string') {
          updated = this.core.conversationEngine.renameConversation(
            convId,
            body.title,
            auth
          );
        }
        if (body.status === 'archived') {
          updated = this.core.conversationEngine.archiveConversation(convId, auth);
        }
        this.sendJson(res, 200, requestId, updated);
        return;
      }
      if (method === 'DELETE') {
        this.core.authService.requireScope(auth, 'conversations:delete');
        const deleted = this.core.conversationEngine.deleteConversation(convId, auth);
        this.sendJson(res, 200, requestId, { deleted });
        return;
      }
    }

    const convMessagesMatch = pathname.match(
      /^\/api\/v1\/conversations\/([^/]+)\/messages$/
    );
    if (convMessagesMatch) {
      const convId = convMessagesMatch[1];
      if (method === 'GET') {
        this.core.authService.requireScope(auth, 'conversations:read');
        const messages = this.core.conversationEngine.getMessageHistory(convId, auth);
        this.sendJson(res, 200, requestId, { conversationId: convId, messages });
        return;
      }
      if (method === 'POST') {
        const body = await this.readJsonBody(req);
        await this.handleChatExecution(res, requestId, auth, {
          ...body,
          conversationId: convId,
          endpointPath: pathname,
        });
        return;
      }
    }

    // 7. Unified Chat Completions Endpoint (Sync + SSE Streaming)
    if (method === 'POST' && pathname === '/api/v1/chat/completions') {
      const body = await this.readJsonBody(req);
      await this.handleChatExecution(res, requestId, auth, {
        ...body,
        endpointPath: pathname,
      });
      return;
    }

    // 8. Multimodal Private File Endpoints
    if (method === 'POST' && pathname === '/api/v1/files') {
      this.core.authService.requireScope(auth, 'files:write');
      const body = await this.readJsonBody(req);
      const originalName = String(body.originalName || '').trim();
      const mimeType = String(body.mimeType || '').trim();
      const base64Data = String(body.contentBase64 || '');
      if (!originalName || !mimeType || !base64Data) {
        throw new Error(
          'File upload requires originalName, mimeType, and contentBase64.'
        );
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const fileRecord = await this.core.multimodal.storePrivateFile({
        orgId: auth.orgId,
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        originalName,
        mimeType,
        contentBuffer: buffer,
      });
      const signedAccess = this.core.multimodal.issueSignedAccessReference({
        fileId: fileRecord.id,
        orgId: auth.orgId,
        userId: auth.userId,
      });
      this.sendJson(res, 201, requestId, {
        file: fileRecord,
        signedAccess,
      });
      return;
    }

    const fileMetaMatch = pathname.match(/^\/api\/v1\/files\/([^/]+)$/);
    if (method === 'GET' && fileMetaMatch) {
      this.core.authService.requireScope(auth, 'files:read');
      const fileId = fileMetaMatch[1];
      const fileRecord = this.core.multimodal.getFileMetadata(fileId, auth.orgId);
      const signedAccess = this.core.multimodal.issueSignedAccessReference({
        fileId,
        orgId: auth.orgId,
        userId: auth.userId,
      });
      this.sendJson(res, 200, requestId, {
        file: fileRecord,
        signedAccess,
      });
      return;
    }

    const fileContentMatch = pathname.match(/^\/api\/v1\/files\/([^/]+)\/content$/);
    if (method === 'GET' && fileContentMatch) {
      this.core.authService.requireScope(auth, 'files:read');
      const fileId = fileContentMatch[1];
      const token = parsedUrl.searchParams.get('token') || '';
      const { record, buffer } = this.core.multimodal.readPrivateFileWithToken(
        fileId,
        token,
        auth.orgId
      );
      res.writeHead(200, {
        'Content-Type': record.mimeType,
        'Content-Length': buffer.byteLength,
        'Cache-Control': 'private, no-store',
      });
      res.end(buffer);
      return;
    }

    // 9. Knowledge Base & Permission-Aware Retrieval Endpoints
    if (method === 'POST' && pathname === '/api/v1/knowledge-bases') {
      this.core.authService.requireScope(auth, 'knowledge:write');
      const body = await this.readJsonBody(req);
      const name = String(body.name || '').trim();
      if (!name) throw new Error('Knowledge base name is required.');
      const kb = this.core.knowledgeEngine.createKnowledgeBase({
        orgId: auth.orgId,
        workspaceId: auth.workspaceId,
        createdByUserId: auth.userId,
        name,
        description: typeof body.description === 'string' ? body.description : undefined,
        visibility: body.visibility as 'organisation' | 'workspace' | 'restricted' | undefined,
      });
      this.sendJson(res, 201, requestId, kb);
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/knowledge-bases') {
      this.core.authService.requireScope(auth, 'knowledge:read');
      const list = this.core.knowledgeEngine.listKnowledgeBases(auth.orgId);
      this.sendJson(res, 200, requestId, { knowledgeBases: list });
      return;
    }

    const kbIngestMatch = pathname.match(
      /^\/api\/v1\/knowledge-bases\/([^/]+)\/documents$/
    );
    if (method === 'POST' && kbIngestMatch) {
      this.core.authService.requireScope(auth, 'knowledge:write');
      const body = await this.readJsonBody(req);
      const result = await this.core.knowledgeEngine.ingestDocument({
        kbId: kbIngestMatch[1],
        auth,
        title: String(body.title || 'Untitled Document'),
        sourceType: (String(body.sourceType || 'business_document') as KnowledgeSourceType),
        sourceUri: String(body.sourceUri || 'internal://document'),
        content: String(body.content || ''),
        permissionVerified: Boolean(body.permissionVerified),
        metadata:
          typeof body.metadata === 'object' && body.metadata !== null
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      });
      this.sendJson(res, 201, requestId, result);
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/knowledge-bases/retrieve') {
      this.core.authService.requireScope(auth, 'knowledge:read');
      const body = await this.readJsonBody(req);
      const kbIds = Array.isArray(body.kbIds) ? body.kbIds.map(String) : [];
      const query = String(body.query || '');
      const results = await this.core.knowledgeEngine.retrieve({
        kbIds,
        auth,
        query,
        topK: typeof body.topK === 'number' ? body.topK : 5,
        metadataFilter:
          typeof body.metadataFilter === 'object' && body.metadataFilter !== null
            ? (body.metadataFilter as Record<string, unknown>)
            : undefined,
      });
      this.sendJson(res, 200, requestId, { results });
      return;
    }

    // 10. Usage & Economics Endpoints
    if (method === 'GET' && pathname === '/api/v1/usage') {
      this.core.authService.requireScope(auth, 'usage:read');
      const summary = this.core.usageEngine.getOrgUsageSummary(auth.orgId);
      this.sendJson(res, 200, requestId, summary);
      return;
    }

    if (method === 'PATCH' && pathname === '/api/v1/usage/billing') {
      this.core.authService.requireScope(auth, 'billing:write');
      const body = await this.readJsonBody(req);
      const updated = this.core.usageEngine.updateBillingAccount({
        orgId: auth.orgId,
        freeCreditsUsd:
          typeof body.freeCreditsUsd === 'number' ? body.freeCreditsUsd : undefined,
        subscriptionAllowanceUsd:
          typeof body.subscriptionAllowanceUsd === 'number'
            ? body.subscriptionAllowanceUsd
            : undefined,
        prepaidCreditsUsd:
          typeof body.prepaidCreditsUsd === 'number' ? body.prepaidCreditsUsd : undefined,
        enterpriseAllocationUsd:
          typeof body.enterpriseAllocationUsd === 'number'
            ? body.enterpriseAllocationUsd
            : undefined,
        promotionalCreditsUsd:
          typeof body.promotionalCreditsUsd === 'number'
            ? body.promotionalCreditsUsd
            : undefined,
        monthlyBudgetLimitUsd:
          body.monthlyBudgetLimitUsd === null || typeof body.monthlyBudgetLimitUsd === 'number'
            ? (body.monthlyBudgetLimitUsd as number | null)
            : undefined,
      });
      this.sendJson(res, 200, requestId, updated);
      return;
    }

    // 11. Administration, Platform Observability & Audited Support Investigation
    if (method === 'GET' && pathname === '/api/v1/admin/observability') {
      const report = this.core.adminService.getSystemObservabilityReport(auth);
      this.sendJson(res, 200, requestId, report);
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/admin/platform') {
      const report = this.core.adminService.getPlatformAdministrationReport(auth);
      this.sendJson(res, 200, requestId, report);
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/admin/support/investigate') {
      const body = await this.readJsonBody(req);
      const report = this.core.adminService.investigateConversationForSupport({
        auth,
        conversationId: String(body.conversationId || ''),
        ticketId: String(body.ticketId || ''),
        reason: String(body.reason || ''),
      });
      this.sendJson(res, 200, requestId, report);
      return;
    }

    // 12. Guided Builder Endpoints ("BUILD WITH GRIOT")
    if (method === 'GET' && pathname === '/api/v1/builder/tools') {
      this.sendJson(res, 200, requestId, {
        tools: this.core.guidedBuildEngine.toolRegistry.listTools(),
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/builder/tools/recommend') {
      const body = await this.readJsonBody(req);
      const recommendation = this.core.guidedBuildEngine.toolRegistry.recommendTool({
        projectCategory: (String(body.projectCategory || 'web_application') as ProjectCategory),
        technicalExperience: (String(
          body.technicalExperience || 'complete_beginner'
        ) as TechnicalExperienceLevel),
        budgetConstraint: (String(body.budgetConstraint || 'free_only') as BudgetConstraint),
        preferredToolId:
          typeof body.preferredToolId === 'string' ? body.preferredToolId : undefined,
      });
      this.sendJson(res, 200, requestId, recommendation);
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/builder/projects') {
      const body = await this.readJsonBody(req);
      const project = await this.core.guidedBuildEngine.startProject({
        auth,
        ideaDescription: String(body.ideaDescription || ''),
        title: typeof body.title === 'string' ? body.title : undefined,
        userObjective:
          typeof body.userObjective === 'string' ? body.userObjective : undefined,
        technicalExperience: body.technicalExperience as
          | TechnicalExperienceLevel
          | undefined,
        budgetConstraint: body.budgetConstraint as BudgetConstraint | undefined,
        preferredToolId:
          typeof body.preferredToolId === 'string' ? body.preferredToolId : undefined,
        detailLevel:
          body.detailLevel === 'technical' ? 'technical' : 'beginner',
        targetAudience:
          typeof body.targetAudience === 'string' ? body.targetAudience : undefined,
        mustHaveFeatures: Array.isArray(body.mustHaveFeatures)
          ? body.mustHaveFeatures.map(String)
          : undefined,
      });
      this.sendJson(res, 201, requestId, project);
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/builder/projects') {
      const projects = this.core.guidedBuildEngine.listProjects(auth);
      this.sendJson(res, 200, requestId, { projects });
      return;
    }

    const builderProjMatch = pathname.match(/^\/api\/v1\/builder\/projects\/([^/]+)$/);
    if (method === 'GET' && builderProjMatch) {
      const project = this.core.guidedBuildEngine.getProject(
        builderProjMatch[1],
        auth
      );
      this.sendJson(res, 200, requestId, project);
      return;
    }

    const builderReqMatch = pathname.match(
      /^\/api\/v1\/builder\/projects\/([^/]+)\/requirements$/
    );
    if (method === 'PATCH' && builderReqMatch) {
      const body = await this.readJsonBody(req);
      const project = await this.core.guidedBuildEngine.refineRequirementsAndPlan({
        projectId: builderReqMatch[1],
        auth,
        clarifyingAnswers:
          typeof body.clarifyingAnswers === 'object' && body.clarifyingAnswers !== null
            ? (body.clarifyingAnswers as Record<string, string>)
            : undefined,
        mustHaveFeatures: Array.isArray(body.mustHaveFeatures)
          ? body.mustHaveFeatures.map(String)
          : undefined,
        technicalExperience: body.technicalExperience as
          | TechnicalExperienceLevel
          | undefined,
        budgetConstraint: body.budgetConstraint as BudgetConstraint | undefined,
        preferredToolId:
          typeof body.preferredToolId === 'string' ? body.preferredToolId : undefined,
        detailLevel:
          body.detailLevel === 'technical'
            ? 'technical'
            : body.detailLevel === 'beginner'
              ? 'beginner'
              : undefined,
      });
      this.sendJson(res, 200, requestId, project);
      return;
    }

    const builderDetailMatch = pathname.match(
      /^\/api\/v1\/builder\/projects\/([^/]+)\/detail-level$/
    );
    if (method === 'PATCH' && builderDetailMatch) {
      const body = await this.readJsonBody(req);
      const project = this.core.guidedBuildEngine.setDetailLevel({
        projectId: builderDetailMatch[1],
        auth,
        detailLevel: body.detailLevel === 'technical' ? 'technical' : 'beginner',
      });
      this.sendJson(res, 200, requestId, project);
      return;
    }

    const builderResultMatch = pathname.match(
      /^\/api\/v1\/builder\/projects\/([^/]+)\/submit-result$/
    );
    if (method === 'POST' && builderResultMatch) {
      const body = await this.readJsonBody(req);
      const project = this.core.guidedBuildEngine.submitStepResult({
        projectId: builderResultMatch[1],
        auth,
        userObservation: String(body.userObservation || ''),
        attachmentSummary:
          typeof body.attachmentSummary === 'string'
            ? body.attachmentSummary
            : undefined,
        markApproved:
          typeof body.markApproved === 'boolean' ? body.markApproved : undefined,
      });
      this.sendJson(res, 200, requestId, project);
      return;
    }

    const builderErrorMatch = pathname.match(
      /^\/api\/v1\/builder\/projects\/([^/]+)\/report-error$/
    );
    if (method === 'POST' && builderErrorMatch) {
      const body = await this.readJsonBody(req);
      const project = this.core.guidedBuildEngine.reportStepError({
        projectId: builderErrorMatch[1],
        auth,
        errorMessage: String(body.errorMessage || ''),
        codeOrLogSnippet:
          typeof body.codeOrLogSnippet === 'string'
            ? body.codeOrLogSnippet
            : undefined,
      });
      this.sendJson(res, 200, requestId, project);
      return;
    }

    // 13. Account Deletion Workflow
    const userDeleteMatch = pathname.match(/^\/api\/v1\/users\/([^/]+)$/);
    if (method === 'DELETE' && userDeleteMatch) {
      const targetUserId = userDeleteMatch[1];
      if (targetUserId !== auth.userId && auth.role !== 'owner' && auth.role !== 'admin') {
        throw new AuthError('Not authorised to delete this account.', 403, 'FORBIDDEN');
      }
      const deleted = this.core.audit.deleteUserAccount({
        targetUserId,
        actorUserId: auth.userId,
        orgId: auth.orgId,
      });
      this.sendJson(res, 200, requestId, deleted);
      return;
    }

    throw new Error(`Route '${method} ${pathname}' not found.`);
  }

  private async handleChatExecution(
    res: http.ServerResponse,
    requestId: string,
    auth: AuthContext,
    body: Record<string, unknown>
  ): Promise<void> {
    const stream = Boolean(body.stream);
    const chatReq = {
      auth,
      productModule:
        typeof body.productModule === 'string'
          ? (body.productModule as GriotProductModuleId)
          : undefined,
      endpointPath:
        typeof body.endpointPath === 'string'
          ? body.endpointPath
          : '/api/v1/chat/completions',
      prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
      messages: Array.isArray(body.messages) ? body.messages : undefined,
      systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
      conversationId:
        typeof body.conversationId === 'string' ? body.conversationId : undefined,
      createConversationIfMissing: Boolean(body.createConversationIfMissing),
      conversationTitle:
        typeof body.conversationTitle === 'string' ? body.conversationTitle : undefined,
      attachmentFileIds: Array.isArray(body.attachmentFileIds)
        ? body.attachmentFileIds.map(String)
        : undefined,
      knowledgeBaseIds: Array.isArray(body.knowledgeBaseIds)
        ? body.knowledgeBaseIds.map(String)
        : undefined,
      knowledgeMetadataFilter:
        typeof body.knowledgeMetadataFilter === 'object' &&
        body.knowledgeMetadataFilter !== null
          ? (body.knowledgeMetadataFilter as Record<string, unknown>)
          : undefined,
      routingHints:
        typeof body.routingHints === 'object' && body.routingHints !== null
          ? (body.routingHints as Record<string, unknown>)
          : undefined,
      temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
      maxOutputTokens:
        typeof body.maxOutputTokens === 'number' ? body.maxOutputTokens : undefined,
      responseFormat:
        body.responseFormat === 'json_object'
          ? ('json_object' as const)
          : ('text' as const),
      tools: Array.isArray(body.tools) ? body.tools : undefined,
    };

    if (!stream) {
      const result = await this.core.executeChat(chatReq);
      this.sendJson(res, 200, requestId, result);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    for await (const event of this.core.streamChat(chatReq)) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    res.write(`event: done\ndata: [DONE]\n\n`);
    res.end();
  }
}
