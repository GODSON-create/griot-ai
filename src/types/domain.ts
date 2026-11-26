// ============================================================================
// GRIOT AI — PHASE 1 CORE DOMAIN TYPES
// Includes Locked Business Decisions:
// 1. Avantage Group access: FREE ('avantage_free')
// 2. Public access: FREEMIUM ('public_freemium')
// 3. Enterprise deployment: SHARED infrastructure with strict tenant isolation ('enterprise_contract')
// 4. Dual Branding: 'griot_standalone' ("GRIOT") & 'griot_powered_by_avantage' ("GRIOT powered by Avantage")
// ============================================================================

export type ProviderName =
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'mistral'
  | 'open_weight';

export type GriotProductModuleId =
  | 'griot_chat'
  | 'griot_learn'
  | 'griot_business'
  | 'griot_develop'
  | 'griot_api'
  | 'griot_agents';

export type AccessModelType =
  | 'avantage_free'
  | 'public_freemium'
  | 'enterprise_contract';

export type BrandingMode =
  | 'griot_standalone'
  | 'griot_powered_by_avantage';

export type ExecutionMode = 'live' | 'mock';

export type ModalityType =
  | 'text'
  | 'image'
  | 'pdf'
  | 'document'
  | 'audio'
  | 'voice_transcription'
  | 'voice_generation'
  | 'video'
  | 'embedding';

export type ModelCapability =
  | 'chat'
  | 'writing'
  | 'summarization'
  | 'classification'
  | 'extraction'
  | 'reasoning'
  | 'coding'
  | 'math'
  | 'vision'
  | 'document_analysis'
  | 'audio_understanding'
  | 'voice_transcription'
  | 'voice_generation'
  | 'video_understanding'
  | 'long_context'
  | 'json_mode'
  | 'tool_use'
  | 'streaming'
  | 'embeddings';

export type ModelAvailability =
  | 'available'
  | 'degraded'
  | 'maintenance'
  | 'offline'
  | 'disabled';

export type DeploymentType =
  | 'cloud_managed_api'
  | 'self_hosted_or_compatible_endpoint'
  | 'dedicated_enterprise_endpoint';

export type ReasoningComplexity = 'low' | 'medium' | 'high';
export type LatencyClass = 'fast' | 'medium' | 'slow';
export type RoutingTier = 'economy' | 'standard' | 'premium' | 'enterprise';

export type TaskClassification =
  | 'simple_writing'
  | 'summarization'
  | 'classification_extraction'
  | 'complex_reasoning'
  | 'coding'
  | 'image_understanding'
  | 'document_analysis'
  | 'audio_processing'
  | 'video_understanding'
  | 'general_chat';

export interface ModelRegistryEntry {
  id: string;
  provider: ProviderName;
  modelIdentifier: string;
  displayName: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutputTokens: number;
  inputPricingPer1M: number | null;
  cachedInputPricingPer1M: number | null;
  outputPricingPer1M: number | null;
  availability: ModelAvailability;
  supportedModalities: {
    input: ModalityType[];
    output: ModalityType[];
  };
  routingEligibility: {
    eligible: boolean;
    tiers: RoutingTier[];
    reasoningTier: 'none' | 'standard' | 'advanced' | 'deep_reasoning';
    latencyClass: LatencyClass;
    priorityWeight: number;
  };
  deploymentType: DeploymentType;
}

export type OrgRole =
  | 'platform_admin'
  | 'owner'
  | 'admin'
  | 'developer'
  | 'member'
  | 'billing'
  | 'viewer'
  | 'support_auditor';

export type PermissionScope =
  | 'chat:write'
  | 'conversations:read'
  | 'conversations:write'
  | 'conversations:delete'
  | 'models:read'
  | 'models:admin'
  | 'files:read'
  | 'files:write'
  | 'knowledge:read'
  | 'knowledge:write'
  | 'builder:read'
  | 'builder:write'
  | 'usage:read'
  | 'billing:write'
  | 'org:read'
  | 'org:admin'
  | 'apikeys:manage'
  | 'admin:observability'
  | 'admin:platform'
  | 'admin:support_investigate';

export interface OrganisationPreferences {
  preferredProviders?: ProviderName[];
  blockedProviders?: ProviderName[];
  preferredModels?: string[];
  costOptimizationMode?: 'balanced' | 'cost_first' | 'quality_first' | 'latency_first';
  allowResponseCaching?: boolean;
  allowPromptLogging?: boolean;
  defaultRoutingTier?: RoutingTier;
}

export interface UserPreferences {
  preferredLanguage?: string;
  responseTone?: 'concise' | 'detailed' | 'executive' | 'educational';
  preferredProvider?: ProviderName;
  preferredModelId?: string;
  defaultProductModule?: GriotProductModuleId;
  learningFocusTracks?: Array<
    | 'entrepreneurship'
    | 'financial_education'
    | 'engineering'
    | 'technology'
    | 'personal_development'
  >;
}

export interface Organisation {
  id: string;
  slug: string;
  name: string;
  isAvantageInternal: boolean;
  accessModel: AccessModelType;
  brandingMode: BrandingMode;
  brandDisplayName: 'GRIOT' | 'GRIOT powered by Avantage';
  parentGroup: string | null;
  tier: RoutingTier;
  status: 'active' | 'suspended' | 'deleted';
  preferences: OrganisationPreferences;
  dataRetentionDays: number;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  preferences: UserPreferences;
  status: 'active' | 'suspended' | 'deleted';
  personalOrgId: string | null;
  spendingLimitUsd: number | null;
  retentionDays: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface Workspace {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
}

export interface OrganisationMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  permissions: PermissionScope[];
  spendingLimitUsd: number | null;
  createdAt: string;
}

export interface AuthContext {
  authType: 'jwt' | 'api_key';
  userId: string;
  orgId: string;
  workspaceId: string | null;
  apiKeyId: string | null;
  role: OrgRole;
  isPlatformAdmin: boolean;
  scopes: PermissionScope[];
  rateLimitRpm: number;
  ipAddress: string;
}

export interface AttachmentReference {
  fileId: string;
  modality: ModalityType;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  extractedText?: string | null;
  inlineBase64?: string;
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  attachments?: AttachmentReference[];
  name?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
}

export interface RoutingHints {
  requestedModelId?: string;
  preferredProvider?: ProviderName;
  taskOverride?: TaskClassification;
  reasoningComplexity?: ReasoningComplexity;
  maxLatencyClass?: LatencyClass;
  maxCostPer1MInputUsd?: number;
  requireJsonOutput?: boolean;
  requiredCapabilities?: ModelCapability[];
  requiredModalities?: ModalityType[];
  stream?: boolean;
}

export interface RoutingDecision {
  selectedModel: ModelRegistryEntry;
  fallbackChain: ModelRegistryEntry[];
  taskClassification: TaskClassification;
  reasoningComplexity: ReasoningComplexity;
  estimatedInputTokens: number;
  requiredCapabilities: ModelCapability[];
  requiredModalities: ModalityType[];
  rationale: string;
}

export interface ProviderGenerationRequest {
  requestId: string;
  model: ModelRegistryEntry;
  messages: ChatMessageInput[];
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: 'text' | 'json_object';
  tools?: ToolDefinition[];
  stream?: boolean;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface ProviderUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  actualProviderCostUsd?: number | null;
}

export interface ProviderGenerationResponse {
  provider: ProviderName;
  modelId: string;
  modelIdentifier: string;
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'interrupted' | 'error';
  usage: ProviderUsageMetrics;
  latencyMs: number;
  executionMode?: ExecutionMode;
  toolCalls?: Array<{ id: string; name: string; argumentsJson: string }>;
  rawMetadata?: Record<string, unknown>;
}

export interface ProviderStreamChunk {
  deltaText: string;
  done: boolean;
  finishReason?: ProviderGenerationResponse['finishReason'];
  usage?: ProviderUsageMetrics;
  executionMode?: ExecutionMode;
}

export interface CreditBreakdown {
  promotionalUsd: number;
  freeUsd: number;
  subscriptionUsd: number;
  enterpriseUsd: number;
  prepaidUsd: number;
}

export interface UsageLedgerRecord {
  id: string;
  requestId: string;
  orgId: string;
  workspaceId: string | null;
  userId: string;
  apiKeyId: string | null;
  conversationId: string | null;
  messageId: string | null;
  featureModule: GriotProductModuleId;
  endpointPath: string;
  applicableAllocation: string;
  executionMode: ExecutionMode;
  provider: ProviderName;
  modelId: string;
  taskType: TaskClassification;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  durationMs: number;
  status: 'completed' | 'streamed' | 'interrupted' | 'cached' | 'failed';
  actualProviderCostUsd: number | null;
  estimatedCostUsd: number;
  billableCostUsd: number;
  costSource:
    | 'actual_provider'
    | 'registry_pricing'
    | 'cached_zero'
    | 'avantage_internal_free';
  creditsBreakdown: CreditBreakdown;
  cacheHit: boolean;
  fallbackUsed: boolean;
  createdAt: string;
}
