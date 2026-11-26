// ============================================================================
// GRIOT AI — INTELLIGENT 9-FACTOR MODEL ROUTING & SAFE FALLBACK ENGINE
// Never routes a request to a model that cannot process its required inputs,
// and never silently downgrades a request when an alternative cannot satisfy
// its capability, modality, context window, or reasoning requirements.
// ============================================================================

import { estimateTokenCount } from '../providers/adapter.ts';
import type { ProviderManager } from '../providers/providerManager.ts';
import type { ModelRegistryService } from '../registry/modelRegistry.ts';
import type {
  ChatMessageInput,
  LatencyClass,
  ModalityType,
  ModelCapability,
  ModelRegistryEntry,
  OrganisationPreferences,
  ReasoningComplexity,
  RoutingDecision,
  RoutingHints,
  TaskClassification,
  ToolDefinition,
} from '../types/domain.ts';

export class RoutingConstraintError extends Error {
  public readonly code = 'ROUTING_CONSTRAINT_UNSATISFIED';
  public readonly statusCode = 422;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RoutingConstraintError';
    this.details = details;
  }
}

export class RoutingEngine {
  private readonly registry: ModelRegistryService;
  private readonly providerManager: ProviderManager;

  constructor(registry: ModelRegistryService, providerManager: ProviderManager) {
    this.registry = registry;
    this.providerManager = providerManager;
  }

  public classifyTaskAndRequirements(params: {
    messages: ChatMessageInput[];
    tools?: ToolDefinition[];
    hints?: RoutingHints;
  }): {
    taskClassification: TaskClassification;
    reasoningComplexity: ReasoningComplexity;
    requiredCapabilities: ModelCapability[];
    requiredModalities: ModalityType[];
    estimatedInputTokens: number;
  } {
    const combinedText = params.messages.map((m) => m.content).join('\n');
    let estimatedInputTokens = estimateTokenCount(combinedText);

    const modalities = new Set<ModalityType>(['text']);
    const capabilities = new Set<ModelCapability>(['chat']);

    if (params.hints?.requiredModalities) {
      for (const mod of params.hints.requiredModalities) modalities.add(mod);
    }
    if (params.hints?.requiredCapabilities) {
      for (const cap of params.hints.requiredCapabilities) capabilities.add(cap);
    }
    if (params.hints?.requireJsonOutput) {
      capabilities.add('json_mode');
    }
    if (params.hints?.stream) {
      capabilities.add('streaming');
    }
    if (params.tools && params.tools.length > 0) {
      capabilities.add('tool_use');
    }

    for (const msg of params.messages) {
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          modalities.add(att.modality);
          if (att.extractedText) {
            estimatedInputTokens += estimateTokenCount(att.extractedText);
          } else {
            estimatedInputTokens += Math.ceil(att.sizeBytes / 100);
          }
          if (att.modality === 'image') capabilities.add('vision');
          if (att.modality === 'pdf' || att.modality === 'document') {
            capabilities.add('document_analysis');
          }
          if (att.modality === 'audio' || att.modality === 'voice_transcription') {
            capabilities.add('audio_understanding');
          }
          if (att.modality === 'video') {
            capabilities.add('video_understanding');
          }
        }
      }
    }

    let task: TaskClassification = params.hints?.taskOverride || 'general_chat';
    if (!params.hints?.taskOverride) {
      if (modalities.has('video')) {
        task = 'video_understanding';
      } else if (modalities.has('audio') || modalities.has('voice_transcription')) {
        task = 'audio_processing';
      } else if (modalities.has('image')) {
        task = 'image_understanding';
      } else if (
        modalities.has('pdf') ||
        modalities.has('document') ||
        estimatedInputTokens > 12000 ||
        /\b(analyse\s+this\s+document|contract\s+clause|annual\s+report|financial\s+statement\s+document)\b/i.test(
          combinedText
        )
      ) {
        task = 'document_analysis';
        capabilities.add('document_analysis');
      } else if (
        /```|\b(function|typescript|javascript|python|sql|refactor|debug|compile|algorithm|regex|stack\s*trace|api\s+endpoint|unit\s+test|class\s+\w+)\b/i.test(
          combinedText
        )
      ) {
        task = 'coding';
        capabilities.add('coding');
      } else if (
        /\b(prove|theorem|multi-step|derivation|architectural\s+tradeoff|game\s+theory|bayesian|differential|formal\s+verification|root\s+cause\s+analysis|complex\s+reasoning|step-by-step\s+logical)\b/i.test(
          combinedText
        )
      ) {
        task = 'complex_reasoning';
        capabilities.add('reasoning');
      } else if (/\b(summarize|summary|tl;dr|condense|executive\s+brief)\b/i.test(combinedText)) {
        task = 'summarization';
        capabilities.add('summarization');
      } else if (
        /\b(classify|categorize|extract\s+entities|parse\s+into\s+json|sentiment)\b/i.test(
          combinedText
        )
      ) {
        task = 'classification_extraction';
      } else if (
        estimatedInputTokens < 800 &&
        /\b(write\s+a\s+short|draft\s+an?\s+email|rewrite|paraphrase|translate|greeting|thank\s+you\s+note|social\s+post|blog\s+intro|simple)\b/i.test(
          combinedText
        )
      ) {
        task = 'simple_writing';
        capabilities.add('writing');
      }
    } else {
      // Ensure capability alignment for explicit task overrides
      if (task === 'coding') capabilities.add('coding');
      if (task === 'complex_reasoning') capabilities.add('reasoning');
      if (task === 'image_understanding') {
        capabilities.add('vision');
        modalities.add('image');
      }
      if (task === 'document_analysis') capabilities.add('document_analysis');
      if (task === 'video_understanding') {
        capabilities.add('video_understanding');
        modalities.add('video');
      }
      if (task === 'audio_processing') {
        capabilities.add('audio_understanding');
        modalities.add('audio');
      }
    }

    let reasoningComplexity: ReasoningComplexity =
      params.hints?.reasoningComplexity || 'low';
    if (!params.hints?.reasoningComplexity) {
      if (task === 'complex_reasoning') {
        reasoningComplexity = 'high';
      } else if (
        task === 'coding' ||
        task === 'document_analysis' ||
        estimatedInputTokens > 16000
      ) {
        reasoningComplexity = 'medium';
      } else {
        reasoningComplexity = 'low';
      }
    }

    if (reasoningComplexity === 'high') {
      capabilities.add('reasoning');
    }
    if (estimatedInputTokens > 100000) {
      capabilities.add('long_context');
    }

    return {
      taskClassification: task,
      reasoningComplexity,
      requiredCapabilities: Array.from(capabilities),
      requiredModalities: Array.from(modalities),
      estimatedInputTokens,
    };
  }

  public selectModel(params: {
    orgId?: string;
    messages: ChatMessageInput[];
    tools?: ToolDefinition[];
    hints?: RoutingHints;
    orgPreferences?: OrganisationPreferences;
    maxOutputTokens?: number;
    requireConfiguredProvider?: boolean;
  }): RoutingDecision {
    const analysis = this.classifyTaskAndRequirements({
      messages: params.messages,
      tools: params.tools,
      hints: params.hints,
    });

    const requiredOutput = params.maxOutputTokens ?? 1024;
    const totalRequiredContext = analysis.estimatedInputTokens + requiredOutput;
    const prefs = params.orgPreferences || {};
    const blockedProviders = new Set(prefs.blockedProviders || []);
    const allModels = this.registry.listModels();

    // If caller explicitly requested a specific model ID, validate it strictly against all hard constraints
    if (params.hints?.requestedModelId) {
      const requested = this.registry.getModelById(params.hints.requestedModelId);
      if (!requested) {
        throw new RoutingConstraintError(
          `Requested model '${params.hints.requestedModelId}' was not found in the GRIOT Model Registry.`,
          { requestedModelId: params.hints.requestedModelId }
        );
      }
      const check = this.satisfiesHardConstraints(requested, {
        requiredCapabilities: analysis.requiredCapabilities,
        requiredModalities: analysis.requiredModalities,
        reasoningComplexity: analysis.reasoningComplexity,
        totalRequiredContext,
        maxCostPer1MInputUsd: params.hints?.maxCostPer1MInputUsd,
        maxLatencyClass: params.hints?.maxLatencyClass,
        blockedProviders,
        orgId: params.orgId,
        requireConfiguredProvider: params.requireConfiguredProvider ?? false,
        ignoreRoutingEligibleFlag: true,
      });
      if (!check.ok) {
        throw new RoutingConstraintError(
          `Requested model '${requested.id}' cannot satisfy request requirements: ${check.reason}`,
          { modelId: requested.id, reason: check.reason }
        );
      }
    }

    // Filter all candidate models that satisfy every hard requirement (no silent downgrades!)
    const eligibleCandidates: ModelRegistryEntry[] = [];
    const rejectionReasons: Record<string, string> = {};

    for (const candidate of allModels) {
      // Never route chat generation to an embeddings-only model
      if (
        candidate.capabilities.length === 1 &&
        candidate.capabilities[0] === 'embeddings'
      ) {
        continue;
      }
      const isExplicitlyRequested = params.hints?.requestedModelId === candidate.id;
      const check = this.satisfiesHardConstraints(candidate, {
        requiredCapabilities: analysis.requiredCapabilities,
        requiredModalities: analysis.requiredModalities,
        reasoningComplexity: analysis.reasoningComplexity,
        totalRequiredContext,
        maxCostPer1MInputUsd: params.hints?.maxCostPer1MInputUsd,
        maxLatencyClass: params.hints?.maxLatencyClass,
        blockedProviders,
        orgId: params.orgId,
        requireConfiguredProvider: params.requireConfiguredProvider ?? false,
        ignoreRoutingEligibleFlag: isExplicitlyRequested,
      });

      if (check.ok) {
        eligibleCandidates.push(candidate);
      } else {
        rejectionReasons[candidate.id] = check.reason || 'constraint_mismatch';
      }
    }

    if (eligibleCandidates.length === 0) {
      throw new RoutingConstraintError(
        `No available model satisfies all request constraints (task=${analysis.taskClassification}, modalities=${analysis.requiredModalities.join(',')}, capabilities=${analysis.requiredCapabilities.join(',')}, reasoning=${analysis.reasoningComplexity}, tokens=${totalRequiredContext}). Refusing to silently downgrade.`,
        {
          taskClassification: analysis.taskClassification,
          requiredModalities: analysis.requiredModalities,
          requiredCapabilities: analysis.requiredCapabilities,
          reasoningComplexity: analysis.reasoningComplexity,
          totalRequiredContext,
          rejectionReasons,
        }
      );
    }

    // Score each eligible candidate across the 9 routing dimensions
    const scored = eligibleCandidates
      .map((model) => ({
        model,
        score: this.scoreCandidate(model, {
          task: analysis.taskClassification,
          reasoningComplexity: analysis.reasoningComplexity,
          estimatedInputTokens: analysis.estimatedInputTokens,
          hints: params.hints,
          prefs,
          orgId: params.orgId,
        }),
      }))
      .sort((a, b) => b.score - a.score);

    const selectedModel = scored[0].model;

    // Build fallback chain: prioritize configured/available providers first so production never
    // wastes fallback attempts on unconfigured providers before trying configured same-provider fallbacks.
    const remaining = scored.slice(1).map((s) => s.model);
    const isConfiguredOrAvailable = (m: ModelRegistryEntry) =>
      this.providerManager.hasLiveCredentials(m.provider, params.orgId) ||
      this.providerManager.isProviderAvailable(m.provider, params.orgId);

    const availableRemaining = remaining.filter(isConfiguredOrAvailable);
    const unavailableRemaining = remaining.filter((m) => !isConfiguredOrAvailable(m));

    const differentProviderFallbacks = availableRemaining.filter(
      (m) => m.provider !== selectedModel.provider
    );
    const sameProviderFallbacks = availableRemaining.filter(
      (m) => m.provider === selectedModel.provider
    );
    const fallbackChain =
      availableRemaining.length > 0 || isConfiguredOrAvailable(selectedModel)
        ? [...differentProviderFallbacks, ...sameProviderFallbacks]
        : unavailableRemaining;

    return {
      selectedModel,
      fallbackChain,
      taskClassification: analysis.taskClassification,
      reasoningComplexity: analysis.reasoningComplexity,
      estimatedInputTokens: analysis.estimatedInputTokens,
      requiredCapabilities: analysis.requiredCapabilities,
      requiredModalities: analysis.requiredModalities,
      rationale: `Selected ${selectedModel.id} (${selectedModel.displayName}) for task '${analysis.taskClassification}' [complexity=${analysis.reasoningComplexity}, inputTokens~${analysis.estimatedInputTokens}, fallbacks=${fallbackChain.length}]`,
    };
  }

  private satisfiesHardConstraints(
    model: ModelRegistryEntry,
    constraints: {
      requiredCapabilities: ModelCapability[];
      requiredModalities: ModalityType[];
      reasoningComplexity: ReasoningComplexity;
      totalRequiredContext: number;
      maxCostPer1MInputUsd?: number;
      maxLatencyClass?: LatencyClass;
      blockedProviders: Set<string>;
      orgId?: string;
      requireConfiguredProvider: boolean;
      ignoreRoutingEligibleFlag?: boolean;
    }
  ): { ok: boolean; reason?: string } {
    if (model.availability !== 'available' && model.availability !== 'degraded') {
      return { ok: false, reason: `availability is ${model.availability}` };
    }
    if (!constraints.ignoreRoutingEligibleFlag && !model.routingEligibility.eligible) {
      return { ok: false, reason: 'model is marked not eligible for automatic routing' };
    }
    if (constraints.blockedProviders.has(model.provider)) {
      return { ok: false, reason: `provider ${model.provider} is blocked by organisation policy` };
    }
    if (
      constraints.requireConfiguredProvider &&
      !this.providerManager.isProviderAvailable(model.provider, constraints.orgId)
    ) {
      return {
        ok: false,
        reason: `provider ${model.provider} circuit is open or credentials are not configured`,
      };
    }

    // 1. Strict Modality Check (Never route to a model that cannot process required input!)
    for (const mod of constraints.requiredModalities) {
      if (!model.supportedModalities.input.includes(mod)) {
        return { ok: false, reason: `missing required input modality '${mod}'` };
      }
    }

    // 2. Strict Capability Check
    for (const cap of constraints.requiredCapabilities) {
      if (!model.capabilities.includes(cap)) {
        return { ok: false, reason: `missing required capability '${cap}'` };
      }
    }

    // 3. Context Window Check
    if (model.contextWindow < constraints.totalRequiredContext) {
      return {
        ok: false,
        reason: `context window (${model.contextWindow}) smaller than required (${constraints.totalRequiredContext})`,
      };
    }

    // 4. Reasoning Complexity Floor (Never silently downgrade high-reasoning requests to standard models)
    if (constraints.reasoningComplexity === 'high') {
      const tier = model.routingEligibility.reasoningTier;
      if (tier !== 'advanced' && tier !== 'deep_reasoning') {
        return {
          ok: false,
          reason: `reasoning tier '${tier}' insufficient for high reasoning complexity`,
        };
      }
    }

    // 5. Cost Ceiling Check
    if (
      constraints.maxCostPer1MInputUsd !== undefined &&
      model.inputPricingPer1M !== null &&
      model.inputPricingPer1M > constraints.maxCostPer1MInputUsd
    ) {
      return {
        ok: false,
        reason: `input price ($${model.inputPricingPer1M}/1M) exceeds ceiling ($${constraints.maxCostPer1MInputUsd}/1M)`,
      };
    }

    // 6. Latency Ceiling Check
    if (constraints.maxLatencyClass) {
      const rank: Record<LatencyClass, number> = { fast: 1, medium: 2, slow: 3 };
      if (
        rank[model.routingEligibility.latencyClass] > rank[constraints.maxLatencyClass]
      ) {
        return {
          ok: false,
          reason: `latency class '${model.routingEligibility.latencyClass}' slower than required '${constraints.maxLatencyClass}'`,
        };
      }
    }

    return { ok: true };
  }

  private scoreCandidate(
    model: ModelRegistryEntry,
    context: {
      task: TaskClassification;
      reasoningComplexity: ReasoningComplexity;
      estimatedInputTokens: number;
      hints?: RoutingHints;
      prefs: OrganisationPreferences;
      orgId?: string;
    }
  ): number {
    let score = model.routingEligibility.priorityWeight;

    // Explicit model request gets highest priority once validated
    if (context.hints?.requestedModelId === model.id) {
      score += 1000;
    }

    // Explicit or organisation preferred provider/model
    if (context.hints?.preferredProvider === model.provider) {
      score += 60;
    }
    if (context.prefs.preferredProviders?.includes(model.provider)) {
      score += 35;
    }
    if (context.prefs.preferredModels?.includes(model.id)) {
      score += 50;
    }

    // Provider live health & live credential bonus (prefer configured live providers over unconfigured mock fallbacks)
    if (this.providerManager.hasLiveCredentials(model.provider, context.orgId)) {
      score += 55;
    } else if (this.providerManager.isProviderAvailable(model.provider, context.orgId)) {
      score += 10;
    }
    if (model.availability === 'degraded') {
      score -= 40;
    }

    const inputCost = model.inputPricingPer1M ?? 1.0;
    const outputCost = model.outputPricingPer1M ?? 3.0;
    const blendedCost = inputCost + outputCost * 0.5;
    const mode = context.prefs.costOptimizationMode || 'balanced';

    // Task-Specific Intelligence Scoring
    switch (context.task) {
      case 'simple_writing':
      case 'summarization':
      case 'classification_extraction': {
        // Strongly favour affordable, fast models for simple writing/summarization
        if (blendedCost <= 0.6) score += 70;
        else if (blendedCost <= 1.5) score += 35;
        else score -= blendedCost * 8;
        if (model.routingEligibility.latencyClass === 'fast') score += 30;
        break;
      }
      case 'complex_reasoning': {
        if (model.routingEligibility.reasoningTier === 'deep_reasoning') score += 85;
        else if (model.routingEligibility.reasoningTier === 'advanced') score += 45;
        break;
      }
      case 'coding': {
        if (model.id.includes('codestral') || model.id.includes('claude-3-7-sonnet')) {
          score += 65;
        } else if (model.routingEligibility.reasoningTier === 'deep_reasoning') {
          score += 55;
        } else if (model.routingEligibility.reasoningTier === 'advanced') {
          score += 40;
        }
        break;
      }
      case 'document_analysis': {
        if (model.contextWindow >= 500000) score += 60;
        else if (model.contextWindow >= 200000) score += 40;
        if (blendedCost <= 1.0) score += 25;
        break;
      }
      case 'image_understanding':
      case 'audio_processing':
      case 'video_understanding': {
        if (model.supportedModalities.input.length >= 4) score += 40;
        if (blendedCost <= 1.0) score += 25;
        break;
      }
      default: {
        if (blendedCost <= 1.0) score += 35;
        break;
      }
    }

    // Organisation optimization mode adjustments
    if (mode === 'cost_first') {
      score += Math.max(0, 80 - blendedCost * 25);
    } else if (mode === 'quality_first') {
      if (model.routingEligibility.reasoningTier === 'deep_reasoning') score += 50;
      if (model.routingEligibility.reasoningTier === 'advanced') score += 35;
    } else if (mode === 'latency_first') {
      if (model.routingEligibility.latencyClass === 'fast') score += 60;
      if (model.routingEligibility.latencyClass === 'slow') score -= 50;
    }

    return score;
  }
}
