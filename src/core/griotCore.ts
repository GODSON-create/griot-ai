// ============================================================================
// GRIOT AI — CENTRAL INTELLIGENCE & MODEL ORCHESTRATION ENGINE (GRIOT CORE)
// Coordinates Authentication, Authorisation, Rate Limiting, Prompt Guard,
// Persistent Conversations, Bounded Context Summarisation, Multimodal File
// Verification, Permission-Aware Knowledge Retrieval, Intelligent 9-Factor
// Routing, Safe Non-Downgrading Fallbacks, Streaming, Cost Caching, and the
// 5-Tier Usage Economics Ledger.
// ============================================================================

import { ObservabilityAndAdminService } from '../admin/observabilityService.ts';
import { loadGriotConfig, type GriotConfig } from '../config/env.ts';
import {
  ConversationEngine,
  type ConversationMessageRecord,
} from '../conversations/conversationEngine.ts';
import { GriotDatabase } from '../db/database.ts';
import { CostOptimizationEngine } from '../economics/costOptimizer.ts';
import { UsageAndEconomicsEngine } from '../economics/usageEngine.ts';
import {
  KnowledgeEngine,
  type RetrievedChunkResult,
} from '../knowledge/knowledgeEngine.ts';
import { MultimodalEngine } from '../multimodal/multimodalEngine.ts';
import {
  estimateTokenCount,
  ProviderError,
  type FetchFunction,
} from '../providers/adapter.ts';
import { ProviderManager } from '../providers/providerManager.ts';
import { ModelRegistryService } from '../registry/modelRegistry.ts';
import { RoutingEngine } from '../routing/routingEngine.ts';
import { AuditAndRetentionService } from '../security/auditAndRetention.ts';
import { AuthError, AuthService } from '../security/auth.ts';
import { generateId } from '../security/crypto.ts';
import {
  sanitizeModelOutput,
  validateMessagesPayload,
  validateModelToolCalls,
} from '../security/promptGuard.ts';
import { RateLimiter } from '../security/rateLimiter.ts';
import { TenantService } from '../tenancy/tenantService.ts';
import type {
  AttachmentReference,
  AuthContext,
  ChatMessageInput,
  ModelRegistryEntry,
  ProviderGenerationResponse,
  RoutingDecision,
  RoutingHints,
  ToolDefinition,
  UsageLedgerRecord,
} from '../types/domain.ts';

export interface GriotChatRequest {
  auth: AuthContext;
  prompt?: string;
  messages?: ChatMessageInput[];
  systemPrompt?: string;
  conversationId?: string;
  createConversationIfMissing?: boolean;
  conversationTitle?: string;
  attachmentFileIds?: string[];
  knowledgeBaseIds?: string[];
  knowledgeMetadataFilter?: Record<string, unknown>;
  knowledgeTopK?: number;
  routingHints?: RoutingHints;
  temperature?: number;
  maxOutputTokens?: number;
  maxContextTokens?: number;
  responseFormat?: 'text' | 'json_object';
  tools?: ToolDefinition[];
  abortSignal?: AbortSignal;
}

export interface GriotChatResult {
  requestId: string;
  conversationId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  content: string;
  provider: string;
  modelId: string;
  modelDisplayName: string;
  routing: {
    taskClassification: string;
    reasoningComplexity: string;
    rationale: string;
    fallbackUsed: boolean;
    attemptedModels: string[];
  };
  cacheHit: boolean;
  deduplicated: boolean;
  knowledgeSources: RetrievedChunkResult['sourceReference'][];
  toolCalls?: Array<{ id: string; name: string; argumentsJson: string }>;
  usageLedger: UsageLedgerRecord;
}

export interface GriotStreamEvent {
  type: 'routing' | 'delta' | 'completed' | 'interrupted' | 'error';
  requestId: string;
  conversationId: string | null;
  deltaText?: string;
  modelId?: string;
  provider?: string;
  fallbackUsed?: boolean;
  usageLedger?: UsageLedgerRecord;
  assistantMessage?: ConversationMessageRecord;
  error?: string;
}

export class GriotCore {
  public readonly config: GriotConfig;
  public readonly database: GriotDatabase;
  public readonly audit: AuditAndRetentionService;
  public readonly authService: AuthService;
  public readonly rateLimiter: RateLimiter;
  public readonly tenantService: TenantService;
  public readonly registry: ModelRegistryService;
  public readonly providerManager: ProviderManager;
  public readonly routingEngine: RoutingEngine;
  public readonly multimodal: MultimodalEngine;
  public readonly knowledgeEngine: KnowledgeEngine;
  public readonly usageEngine: UsageAndEconomicsEngine;
  public readonly costOptimizer: CostOptimizationEngine;
  public readonly conversationEngine: ConversationEngine;
  public readonly adminService: ObservabilityAndAdminService;

  constructor(options?: {
    config?: Partial<GriotConfig>;
    fetchFn?: FetchFunction;
  }) {
    this.config = loadGriotConfig(options?.config);
    this.database = new GriotDatabase(this.config.sqlitePath);
    this.audit = new AuditAndRetentionService(
      this.database,
      this.config.privateStorageDir
    );
    this.authService = new AuthService(
      this.database,
      this.config.jwtSecret,
      this.config.defaultRateLimitRpm
    );
    this.rateLimiter = new RateLimiter(this.config.defaultRateLimitRpm);
    this.tenantService = new TenantService({
      database: this.database,
      audit: this.audit,
      jwtSecret: this.config.jwtSecret,
      vaultMasterKey: this.config.vaultMasterKey,
    });
    this.registry = new ModelRegistryService(
      this.config.modelRegistryPath,
      this.database
    );
    this.providerManager = new ProviderManager({
      config: this.config,
      tenantService: this.tenantService,
      fetchFn: options?.fetchFn,
    });
    this.routingEngine = new RoutingEngine(this.registry, this.providerManager);
    this.multimodal = new MultimodalEngine({
      database: this.database,
      audit: this.audit,
      privateStorageDir: this.config.privateStorageDir,
      fileSigningSecret: this.config.fileSigningSecret,
    });
    this.knowledgeEngine = new KnowledgeEngine(this.database, this.audit);
    this.usageEngine = new UsageAndEconomicsEngine(this.database);
    this.costOptimizer = new CostOptimizationEngine({
      enabled: this.config.enableResponseCache,
      ttlSeconds: this.config.cacheTtlSeconds,
    });
    this.conversationEngine = new ConversationEngine(this.database, this.audit);
    this.adminService = new ObservabilityAndAdminService({
      database: this.database,
      registry: this.registry,
      providerManager: this.providerManager,
      audit: this.audit,
    });
  }

  private EnforcePreChecks(request: GriotChatRequest): {
    requestId: string;
    attachments: AttachmentReference[];
    rawMessages: ChatMessageInput[];
  } {
    // 1. Permission Scope Check
    this.authService.requireScope(request.auth, 'chat:write');

    // 2. Rate Limit & Abuse Protection
    const rl = this.rateLimiter.checkAndConsume({
      userId: request.auth.userId,
      orgId: request.auth.orgId,
      apiKeyId: request.auth.apiKeyId,
      ipAddress: request.auth.ipAddress,
      customRpm: request.auth.rateLimitRpm,
    });
    if (!rl.allowed) {
      this.audit.record({
        orgId: request.auth.orgId,
        actorUserId: request.auth.userId,
        actorApiKeyId: request.auth.apiKeyId,
        action: 'rate_limit.exceeded',
        resourceType: 'chat_request',
        outcome: 'denied',
        ipAddress: request.auth.ipAddress,
        details: { scopeBlocked: rl.scopeBlocked, retryAfterSeconds: rl.retryAfterSeconds },
      });
      throw new AuthError(
        `Rate limit exceeded (${rl.scopeBlocked}). Retry after ${rl.retryAfterSeconds}s.`,
        429,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    // 3. Resolve & Verify Private File Attachments
    const attachments =
      request.attachmentFileIds && request.attachmentFileIds.length > 0
        ? this.multimodal.resolveAttachmentsForOrchestration(
            request.auth.orgId,
            request.attachmentFileIds
          )
        : [];

    // 4. Construct Message Array
    const rawMessages: ChatMessageInput[] = [];
    if (request.messages && request.messages.length > 0) {
      for (let i = 0; i < request.messages.length; i++) {
        const msg = structuredClone(request.messages[i]);
        if (i === request.messages.length - 1 && attachments.length > 0) {
          msg.attachments = [...(msg.attachments || []), ...attachments];
        }
        rawMessages.push(msg);
      }
    } else if (typeof request.prompt === 'string' && request.prompt.trim().length > 0) {
      rawMessages.push({
        role: 'user',
        content: request.prompt,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    } else {
      throw new Error('Request must provide either a non-empty prompt or messages array.');
    }

    // 5. Prompt Injection & Payload Validation
    const validation = validateMessagesPayload(rawMessages);
    if (!validation.valid) {
      this.audit.record({
        orgId: request.auth.orgId,
        actorUserId: request.auth.userId,
        action: 'prompt_guard.blocked',
        resourceType: 'chat_request',
        outcome: 'denied',
        ipAddress: request.auth.ipAddress,
        details: { reason: validation.reason, patterns: validation.riskPatterns },
      });
      throw new AuthError(validation.reason || 'Prompt validation failed', 400, 'UNSAFE_PROMPT');
    }

    return {
      requestId: generateId('req'),
      attachments,
      rawMessages,
    };
  }

  public async executeChat(request: GriotChatRequest): Promise<GriotChatResult> {
    const startMs = Date.now();
    const { requestId, attachments, rawMessages } = this.EnforcePreChecks(request);
    const org = this.tenantService.getOrganisation(request.auth.orgId);
    if (!org || org.status !== 'active') {
      throw new AuthError('Organisation is not active.', 403, 'ORG_INACTIVE');
    }

    // 1. Knowledge Retrieval (Permission-Aware RAG)
    let retrievedChunks: RetrievedChunkResult[] = [];
    const lastUserMessage = [...rawMessages].reverse().find((m) => m.role === 'user');
    if (
      request.knowledgeBaseIds &&
      request.knowledgeBaseIds.length > 0 &&
      lastUserMessage
    ) {
      this.authService.requireScope(request.auth, 'knowledge:read');
      retrievedChunks = await this.knowledgeEngine.retrieve({
        kbIds: request.knowledgeBaseIds,
        auth: request.auth,
        query: lastUserMessage.content,
        topK: request.knowledgeTopK ?? 4,
        metadataFilter: request.knowledgeMetadataFilter,
      });
    }

    const ragSystemContext =
      this.knowledgeEngine.formatRetrievedContextForPrompt(retrievedChunks);
    const combinedSystemPrompt = [request.systemPrompt, ragSystemContext]
      .filter(Boolean)
      .join('\n\n');

    // 2. Persistent Conversation & Bounded Context Window Management
    let activeConversationId: string | null = request.conversationId ?? null;
    let userMessageId: string | null = null;
    let messagesForModel: ChatMessageInput[] = [];

    if (!activeConversationId && request.createConversationIfMissing) {
      const conv = this.conversationEngine.createConversation({
        auth: request.auth,
        title:
          request.conversationTitle ||
          (lastUserMessage ? lastUserMessage.content.slice(0, 60) : 'New Conversation'),
      });
      activeConversationId = conv.id;
    }

    if (activeConversationId) {
      if (lastUserMessage) {
        const savedUserMsg = this.conversationEngine.appendMessage({
          conversationId: activeConversationId,
          auth: request.auth,
          role: 'user',
          content: lastUserMessage.content,
          attachments,
        });
        userMessageId = savedUserMsg.id;
      }

      const bounded = this.conversationEngine.buildBoundedContextWindow({
        conversationId: activeConversationId,
        auth: request.auth,
        maxContextTokens: request.maxContextTokens ?? 4000,
        systemPrompt: combinedSystemPrompt || undefined,
      });
      messagesForModel = bounded.contextMessages;
      // Ensure full attachment data (including inlineBase64) is present on the final user message
      if (attachments.length > 0 && messagesForModel.length > 0) {
        const lastIdx = messagesForModel.length - 1;
        if (messagesForModel[lastIdx].role === 'user') {
          messagesForModel[lastIdx] = {
            ...messagesForModel[lastIdx],
            attachments,
          };
        }
      }
    } else {
      if (combinedSystemPrompt) {
        messagesForModel.push({ role: 'system', content: combinedSystemPrompt });
      }
      messagesForModel.push(...rawMessages);
    }

    // 3. Intelligent Model Routing
    const routingDecision: RoutingDecision = this.routingEngine.selectModel({
      orgId: org.id,
      messages: messagesForModel,
      tools: request.tools,
      hints: {
        ...request.routingHints,
        requireJsonOutput:
          request.responseFormat === 'json_object' ||
          request.routingHints?.requireJsonOutput,
        stream: false,
      },
      orgPreferences: org.preferences,
      maxOutputTokens: request.maxOutputTokens,
    });

    // 4. Hard Multimodal Capability Gate
    this.multimodal.assertModelSupportsAttachments(
      routingDecision.selectedModel,
      attachments
    );

    // 5. Pre-Flight Spending Limit & Credit Balance Check
    const projectedCost = this.usageEngine.calculateModelCost({
      model: routingDecision.selectedModel,
      usage: {
        inputTokens: routingDecision.estimatedInputTokens,
        outputTokens: request.maxOutputTokens ?? 512,
        cachedInputTokens: 0,
      },
    }).billableCostUsd;

    this.usageEngine.assertWithinSpendingLimits({
      orgId: org.id,
      userId: request.auth.userId,
      apiKeyId: request.auth.apiKeyId,
      estimatedRequestCostUsd: projectedCost,
    });

    // 6. Response Cache Check
    const allowOrgCache = org.preferences.allowResponseCaching !== false;
    const cacheKey = this.costOptimizer.computeCacheKey({
      orgId: org.id,
      modelId: routingDecision.selectedModel.id,
      messages: messagesForModel,
      temperature: request.temperature,
      responseFormat: request.responseFormat,
      tools: request.tools,
    });

    const cachedResponse = this.costOptimizer.getCachedResponse(cacheKey, allowOrgCache);
    if (cachedResponse) {
      let assistantMessageId: string | null = null;
      if (activeConversationId) {
        const saved = this.conversationEngine.appendMessage({
          conversationId: activeConversationId,
          auth: request.auth,
          role: 'assistant',
          content: cachedResponse.content,
          provider: routingDecision.selectedModel.provider,
          modelId: routingDecision.selectedModel.id,
          status: 'completed',
          inputTokens: cachedResponse.usage.inputTokens,
          outputTokens: cachedResponse.usage.outputTokens,
          cachedTokens: cachedResponse.usage.inputTokens,
          costUsd: 0,
          latencyMs: 0,
          metadata: { cacheHit: true },
        });
        assistantMessageId = saved.id;
      }

      const ledger = this.usageEngine.recordUsage({
        requestId,
        orgId: org.id,
        workspaceId: request.auth.workspaceId,
        userId: request.auth.userId,
        apiKeyId: request.auth.apiKeyId,
        conversationId: activeConversationId,
        messageId: assistantMessageId,
        model: routingDecision.selectedModel,
        taskType: routingDecision.taskClassification,
        usage: cachedResponse.usage,
        durationMs: Date.now() - startMs,
        status: 'cached',
        cacheHit: true,
        fallbackUsed: false,
      });

      return {
        requestId,
        conversationId: activeConversationId,
        userMessageId,
        assistantMessageId,
        content: cachedResponse.content,
        provider: routingDecision.selectedModel.provider,
        modelId: routingDecision.selectedModel.id,
        modelDisplayName: routingDecision.selectedModel.displayName,
        routing: {
          taskClassification: routingDecision.taskClassification,
          reasoningComplexity: routingDecision.reasoningComplexity,
          rationale: routingDecision.rationale,
          fallbackUsed: false,
          attemptedModels: [routingDecision.selectedModel.id],
        },
        cacheHit: true,
        deduplicated: false,
        knowledgeSources: retrievedChunks.map((c) => c.sourceReference),
        usageLedger: ledger,
      };
    }

    // 7. Execute Provider Call with Safe Non-Downgrading Fallbacks & In-Flight Deduplication
    const candidates: ModelRegistryEntry[] = [
      routingDecision.selectedModel,
      ...routingDecision.fallbackChain,
    ];
    const attemptedModels: string[] = [];
    let finalResponse: ProviderGenerationResponse | null = null;
    let usedModel: ModelRegistryEntry = routingDecision.selectedModel;
    let deduplicated = false;
    let lastError: Error | null = null;

    for (let idx = 0; idx < candidates.length; idx++) {
      const candidate = candidates[idx];
      // Verify fallback model still satisfies all multimodal attachments (never downgrade!)
      this.multimodal.assertModelSupportsAttachments(candidate, attachments);
      attemptedModels.push(candidate.id);

      const adapter = this.providerManager.getAdapter(candidate.provider);
      const credentials = this.providerManager.resolveCredentials(
        candidate.provider,
        org.id
      );

      try {
        const execResult = await this.costOptimizer.executeWithDeduplication(
          idx === 0 ? cacheKey : null,
          () =>
            adapter.generate(
              {
                requestId,
                model: candidate,
                messages: messagesForModel,
                temperature: request.temperature,
                maxOutputTokens: request.maxOutputTokens,
                responseFormat: request.responseFormat,
                tools: request.tools,
                stream: false,
                abortSignal: request.abortSignal,
              },
              credentials
            )
        );
        finalResponse = execResult.response;
        deduplicated = execResult.deduplicated;
        usedModel = candidate;
        this.providerManager.recordSuccess(candidate.provider, finalResponse.latencyMs);
        break;
      } catch (err) {
        lastError = err as Error;
        this.providerManager.recordFailure(candidate.provider, lastError.message);
        const isRetryable =
          err instanceof ProviderError ? err.retryable || err.category === 'auth_error' : true;
        if (!isRetryable || idx === candidates.length - 1) {
          break;
        }
      }
    }

    if (!finalResponse) {
      this.usageEngine.recordUsage({
        requestId,
        orgId: org.id,
        workspaceId: request.auth.workspaceId,
        userId: request.auth.userId,
        apiKeyId: request.auth.apiKeyId,
        conversationId: activeConversationId,
        model: usedModel,
        taskType: routingDecision.taskClassification,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        durationMs: Date.now() - startMs,
        status: 'failed',
        cacheHit: false,
        fallbackUsed: attemptedModels.length > 1,
      });
      throw (
        lastError ||
        new Error('All eligible model providers failed to complete the request.')
      );
    }

    // 8. Validate Tool Calls & Sanitize Model Output
    const toolValidation = validateModelToolCalls(
      finalResponse.toolCalls,
      request.tools
    );
    if (!toolValidation.valid) {
      this.audit.record({
        orgId: org.id,
        actorUserId: request.auth.userId,
        action: 'tool_guard.blocked_unauthorised_tool',
        resourceType: 'chat_response',
        resourceId: requestId,
        outcome: 'denied',
        details: { reason: toolValidation.reason, modelId: usedModel.id },
      });
      throw new AuthError(
        toolValidation.reason || 'Unauthorised tool call blocked',
        403,
        'UNAUTHORISED_TOOL_EXECUTION'
      );
    }

    const cleanContent = sanitizeModelOutput(finalResponse.content);
    finalResponse.content = cleanContent;

    // 9. Store in Response Cache if eligible
    if (attemptedModels.length === 1) {
      this.costOptimizer.setCachedResponse(cacheKey, finalResponse, allowOrgCache);
    }

    const fallbackUsed = attemptedModels.length > 1;
    const costPreview = this.usageEngine.calculateModelCost({
      model: usedModel,
      usage: finalResponse.usage,
      cacheHit: false,
    });

    // 10. Persist Assistant Message in Conversation
    let assistantMessageId: string | null = null;
    if (activeConversationId) {
      const savedMsg = this.conversationEngine.appendMessage({
        conversationId: activeConversationId,
        auth: request.auth,
        role: 'assistant',
        content: cleanContent,
        provider: usedModel.provider,
        modelId: usedModel.id,
        status: 'completed',
        inputTokens: finalResponse.usage.inputTokens,
        outputTokens: finalResponse.usage.outputTokens,
        cachedTokens: finalResponse.usage.cachedInputTokens,
        costUsd: costPreview.billableCostUsd,
        latencyMs: finalResponse.latencyMs,
        metadata: {
          taskClassification: routingDecision.taskClassification,
          fallbackUsed,
          attemptedModels,
          knowledgeSources: retrievedChunks.map((c) => c.sourceReference),
        },
      });
      assistantMessageId = savedMsg.id;
    }

    // 11. Record Server-Side Usage & Deduct 5-Tier Credits
    const ledger = this.usageEngine.recordUsage({
      requestId,
      orgId: org.id,
      workspaceId: request.auth.workspaceId,
      userId: request.auth.userId,
      apiKeyId: request.auth.apiKeyId,
      conversationId: activeConversationId,
      messageId: assistantMessageId,
      model: usedModel,
      taskType: routingDecision.taskClassification,
      usage: finalResponse.usage,
      durationMs: Date.now() - startMs,
      status: 'completed',
      cacheHit: false,
      fallbackUsed,
    });

    return {
      requestId,
      conversationId: activeConversationId,
      userMessageId,
      assistantMessageId,
      content: cleanContent,
      provider: usedModel.provider,
      modelId: usedModel.id,
      modelDisplayName: usedModel.displayName,
      routing: {
        taskClassification: routingDecision.taskClassification,
        reasoningComplexity: routingDecision.reasoningComplexity,
        rationale: routingDecision.rationale,
        fallbackUsed,
        attemptedModels,
      },
      cacheHit: false,
      deduplicated,
      knowledgeSources: retrievedChunks.map((c) => c.sourceReference),
      toolCalls: finalResponse.toolCalls,
      usageLedger: ledger,
    };
  }

  /**
   * Streams an AI response with full support for provider failover prior to first token
   * and graceful persistence of interrupted responses if aborted mid-stream.
   */
  public async *streamChat(
    request: GriotChatRequest
  ): AsyncGenerator<GriotStreamEvent, void, unknown> {
    const startMs = Date.now();
    const { requestId, attachments, rawMessages } = this.EnforcePreChecks(request);
    const org = this.tenantService.getOrganisation(request.auth.orgId);
    if (!org || org.status !== 'active') {
      throw new AuthError('Organisation is not active.', 403, 'ORG_INACTIVE');
    }

    let activeConversationId: string | null = request.conversationId ?? null;
    const lastUserMessage = [...rawMessages].reverse().find((m) => m.role === 'user');

    if (!activeConversationId && request.createConversationIfMissing) {
      const conv = this.conversationEngine.createConversation({
        auth: request.auth,
        title:
          request.conversationTitle ||
          (lastUserMessage ? lastUserMessage.content.slice(0, 60) : 'Streaming Session'),
      });
      activeConversationId = conv.id;
    }

    let messagesForModel: ChatMessageInput[] = [];
    if (activeConversationId) {
      if (lastUserMessage) {
        this.conversationEngine.appendMessage({
          conversationId: activeConversationId,
          auth: request.auth,
          role: 'user',
          content: lastUserMessage.content,
          attachments,
        });
      }
      const bounded = this.conversationEngine.buildBoundedContextWindow({
        conversationId: activeConversationId,
        auth: request.auth,
        maxContextTokens: request.maxContextTokens ?? 4000,
        systemPrompt: request.systemPrompt,
      });
      messagesForModel = bounded.contextMessages;
    } else {
      if (request.systemPrompt) {
        messagesForModel.push({ role: 'system', content: request.systemPrompt });
      }
      messagesForModel.push(...rawMessages);
    }

    const routingDecision = this.routingEngine.selectModel({
      orgId: org.id,
      messages: messagesForModel,
      tools: request.tools,
      hints: { ...request.routingHints, stream: true },
      orgPreferences: org.preferences,
      maxOutputTokens: request.maxOutputTokens,
    });

    this.multimodal.assertModelSupportsAttachments(
      routingDecision.selectedModel,
      attachments
    );

    this.usageEngine.assertWithinSpendingLimits({
      orgId: org.id,
      userId: request.auth.userId,
      apiKeyId: request.auth.apiKeyId,
      estimatedRequestCostUsd: 0.0001,
    });

    const candidates = [
      routingDecision.selectedModel,
      ...routingDecision.fallbackChain,
    ];
    let usedModel = routingDecision.selectedModel;
    let accumulatedContent = '';
    let finalUsage = {
      inputTokens: routingDecision.estimatedInputTokens,
      outputTokens: 0,
      cachedInputTokens: 0,
    };
    let wasInterrupted = false;
    let streamSucceeded = false;
    let fallbackUsed = false;

    for (let idx = 0; idx < candidates.length; idx++) {
      const candidate = candidates[idx];
      this.multimodal.assertModelSupportsAttachments(candidate, attachments);
      usedModel = candidate;
      fallbackUsed = idx > 0;

      const adapter = this.providerManager.getAdapter(candidate.provider);
      const credentials = this.providerManager.resolveCredentials(
        candidate.provider,
        org.id
      );

      try {
        yield {
          type: 'routing',
          requestId,
          conversationId: activeConversationId,
          modelId: candidate.id,
          provider: candidate.provider,
          fallbackUsed,
        };

        for await (const chunk of adapter.stream(
          {
            requestId,
            model: candidate,
            messages: messagesForModel,
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
            stream: true,
            abortSignal: request.abortSignal,
          },
          credentials
        )) {
          if (request.abortSignal?.aborted || chunk.finishReason === 'interrupted') {
            wasInterrupted = true;
          }
          if (chunk.deltaText) {
            accumulatedContent += chunk.deltaText;
            yield {
              type: 'delta',
              requestId,
              conversationId: activeConversationId,
              deltaText: chunk.deltaText,
              modelId: candidate.id,
              provider: candidate.provider,
            };
          }
          if (chunk.usage) {
            finalUsage = {
              inputTokens: chunk.usage.inputTokens,
              outputTokens: chunk.usage.outputTokens,
              cachedInputTokens: chunk.usage.cachedInputTokens,
            };
          }
          if (wasInterrupted) {
            break;
          }
        }

        streamSucceeded = true;
        this.providerManager.recordSuccess(candidate.provider, Date.now() - startMs);
        break;
      } catch (err) {
        this.providerManager.recordFailure(candidate.provider, (err as Error).message);
        // Only fail over to next provider if no partial tokens were emitted yet
        if (accumulatedContent.length > 0) {
          wasInterrupted = true;
          streamSucceeded = true;
          break;
        }
        if (idx === candidates.length - 1) {
          throw err;
        }
      }
    }

    if (!streamSucceeded) {
      throw new Error('Streaming failed across all eligible providers.');
    }

    if (finalUsage.outputTokens === 0 && accumulatedContent.length > 0) {
      finalUsage.outputTokens = estimateTokenCount(accumulatedContent);
    }

    const cleanContent = sanitizeModelOutput(accumulatedContent);
    const status = wasInterrupted ? 'interrupted' : 'streamed';
    const costPreview = this.usageEngine.calculateModelCost({
      model: usedModel,
      usage: finalUsage,
    });

    let savedAssistantMsg: ConversationMessageRecord | undefined;
    if (activeConversationId) {
      savedAssistantMsg = this.conversationEngine.appendMessage({
        conversationId: activeConversationId,
        auth: request.auth,
        role: 'assistant',
        content: cleanContent,
        provider: usedModel.provider,
        modelId: usedModel.id,
        status: wasInterrupted ? 'interrupted' : 'completed',
        inputTokens: finalUsage.inputTokens,
        outputTokens: finalUsage.outputTokens,
        cachedTokens: finalUsage.cachedInputTokens,
        costUsd: costPreview.billableCostUsd,
        latencyMs: Date.now() - startMs,
        interruptedAtChar: wasInterrupted ? cleanContent.length : null,
      });
    }

    const ledger = this.usageEngine.recordUsage({
      requestId,
      orgId: org.id,
      workspaceId: request.auth.workspaceId,
      userId: request.auth.userId,
      apiKeyId: request.auth.apiKeyId,
      conversationId: activeConversationId,
      messageId: savedAssistantMsg?.id ?? null,
      model: usedModel,
      taskType: routingDecision.taskClassification,
      usage: finalUsage,
      durationMs: Date.now() - startMs,
      status,
      cacheHit: false,
      fallbackUsed,
    });

    yield {
      type: wasInterrupted ? 'interrupted' : 'completed',
      requestId,
      conversationId: activeConversationId,
      modelId: usedModel.id,
      provider: usedModel.provider,
      fallbackUsed,
      usageLedger: ledger,
      assistantMessage: savedAssistantMsg,
    };
  }

  public close(): void {
    this.database.close();
  }
}
