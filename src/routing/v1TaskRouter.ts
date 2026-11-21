// ============================================================================
// GRIOT AI — V1 TASK ROUTING & ESCALATION STATE MACHINE
// Supports the 5 V1 Execution States:
// - LOCAL_EXECUTION
// - OPEN_MODEL_ESCALATION
// - EXTERNAL_ESCALATION
// - RESULT_VALIDATION
// - UNSUPPORTED
// And the 8 V1 Supported Task Categories:
// 1. general_conversation
// 2. writing_and_rewriting
// 3. summarisation
// 4. explanations_and_learning
// 5. text_classification
// 6. structured_data_extraction
// 7. basic_reasoning
// 8. basic_coding_assistance
// Enforces local-first execution and strict organisational data-sharing policy
// before any external provider escalation.
// ============================================================================

import { estimateTokenCount } from '../providers/adapter.ts';
import type {
  ChatMessageInput,
  ModelRegistryEntry,
  OrganisationPreferences,
} from '../types/domain.ts';
import type { ResultValidationRequirements } from '../validation/resultValidator.ts';

export type V1ExecutionState =
  | 'LOCAL_EXECUTION'
  | 'OPEN_MODEL_ESCALATION'
  | 'EXTERNAL_ESCALATION'
  | 'RESULT_VALIDATION'
  | 'UNSUPPORTED';

export type V1TaskCategory =
  | 'general_conversation'
  | 'writing_and_rewriting'
  | 'summarisation'
  | 'explanations_and_learning'
  | 'text_classification'
  | 'structured_data_extraction'
  | 'basic_reasoning'
  | 'basic_coding_assistance'
  | 'unsupported';

export interface V1TaskClassificationResult {
  category: V1TaskCategory;
  executionState: V1ExecutionState;
  unsupportedReason?: string;
  validationRequirements: ResultValidationRequirements;
  estimatedInputTokens: number;
}

const UNSUPPORTED_TASK_PATTERNS: Array<{ id: string; regex: RegExp; reason: string }> = [
  {
    id: 'video_generation',
    regex: /\b(generate\s+a?\s*4k\s+video|render\s+a?\s*3d\s+movie|create\s+an?\s*mp4\s+video\s+animation)\b/i,
    reason: 'Video generation and 3D movie rendering are not supported in GRIOT V1 local text intelligence.',
  },
  {
    id: 'autonomous_live_financial_trading',
    regex: /\b(execute\s+live\s+stock\s+trades|transfer\s+real\s+funds\s+from\s+my\s+bank|place\s+live\s+crypto\s+orders)\b/i,
    reason: 'Autonomous live financial trade execution and bank transfers are unsupported for safety.',
  },
  {
    id: 'unauthorised_system_exploitation',
    regex: /\b(hack\s+into|exploit\s+zero-day|ddos\s+attack|ransomware\s+payload)\b/i,
    reason: 'Offensive cyber exploitation tasks are prohibited and unsupported.',
  },
];

export class V1TaskRouter {
  private readonly maxLocalInputTokens: number;

  constructor(options?: { maxLocalInputTokens?: number }) {
    this.maxLocalInputTokens = options?.maxLocalInputTokens ?? 16000;
  }

  public classifyV1Task(params: {
    messages: ChatMessageInput[];
    responseFormat?: 'text' | 'json_object';
    explicitValidation?: ResultValidationRequirements;
  }): V1TaskClassificationResult {
    const combinedText = params.messages.map((m) => m.content).join('\n');
    const estimatedInputTokens = estimateTokenCount(combinedText);

    // 1. Check for explicitly unsupported tasks or modalities
    for (const rule of UNSUPPORTED_TASK_PATTERNS) {
      if (rule.regex.test(combinedText)) {
        return {
          category: 'unsupported',
          executionState: 'UNSUPPORTED',
          unsupportedReason: rule.reason,
          validationRequirements: {},
          estimatedInputTokens,
        };
      }
    }

    // Check if request exceeds V1 maximum input token limit
    if (estimatedInputTokens > 120000) {
      return {
        category: 'unsupported',
        executionState: 'UNSUPPORTED',
        unsupportedReason: `Input size (${estimatedInputTokens} estimated tokens) exceeds GRIOT V1 maximum supported limit (120,000 tokens).`,
        validationRequirements: {},
        estimatedInputTokens,
      };
    }

    const validationRequirements: ResultValidationRequirements = {
      minLengthChars: 2,
      ...(params.explicitValidation || {}),
    };

    if (params.responseFormat === 'json_object') {
      validationRequirements.requireJson = true;
    }

    // 2. Classify into one of the 8 supported V1 Task Categories
    let category: V1TaskCategory = 'general_conversation';

    if (
      params.responseFormat === 'json_object' ||
      validationRequirements.requireJson ||
      (validationRequirements.requiredJsonFields &&
        validationRequirements.requiredJsonFields.length > 0) ||
      /\b(extract\s+(into|as|the)\s+json|structured\s+data|extract\s+fields|parse\s+this\s+into\s+json)\b/i.test(
        combinedText
      )
    ) {
      category = 'structured_data_extraction';
      validationRequirements.requireJson = true;
    } else if (
      (validationRequirements.allowedClassificationLabels &&
        validationRequirements.allowedClassificationLabels.length > 0) ||
      /\b(classify|categorize|sentiment\s+of|which\s+category|label\s+this\s+text)\b/i.test(
        combinedText
      )
    ) {
      category = 'text_classification';
    } else if (
      /```|\b(write\s+a?\s*(typescript|javascript|python|sql|html|css)\s+function|debug\s+this\s+code|code\s+snippet|implement\s+a\s+function|refactor\s+this)\b/i.test(
        combinedText
      )
    ) {
      category = 'basic_coding_assistance';
    } else if (
      /\b(summarize|summarise|summary\s+of|tl;dr|condense\s+this|key\s+takeaways\s+from)\b/i.test(
        combinedText
      )
    ) {
      category = 'summarisation';
    } else if (
      /\b(explain\s+how|teach\s+me|help\s+me\s+understand|what\s+is\s+the\s+concept\s+of|lesson\s+on|tutor\s+me)\b/i.test(
        combinedText
      )
    ) {
      category = 'explanations_and_learning';
    } else if (
      /\b(write\s+an?\s+(email|letter|article|memo|proposal|bio|announcement)|rewrite\s+this|polish\s+this\s+draft|professional\s+tone)\b/i.test(
        combinedText
      )
    ) {
      category = 'writing_and_rewriting';
    } else if (
      /\b(step\s+by\s+step|compare\s+the\s+pros\s+and\s+cons|logical|deduce|calculate|why\s+would|if\s+.*\s+then\s+what)\b/i.test(
        combinedText
      )
    ) {
      category = 'basic_reasoning';
    }

    return {
      category,
      executionState: 'LOCAL_EXECUTION',
      validationRequirements,
      estimatedInputTokens,
    };
  }

  /**
   * Determines whether an organisation permits escalation to an external cloud provider
   * when local open-weight execution is unavailable or fails validation.
   * Rule: Never silently send private organisational data to another provider without
   * the applicable organisation's permission and configured data-sharing policy.
   */
  public canEscalateToExternalProvider(params: {
    orgPreferences?: OrganisationPreferences & {
      allowExternalProviderEscalation?: boolean;
    };
    explicitRequestPermission?: boolean;
    hasExternalCredentials: boolean;
  }): { allowed: boolean; reason: string } {
    if (!params.hasExternalCredentials) {
      return {
        allowed: false,
        reason: 'No external cloud provider credentials are configured.',
      };
    }

    const orgPolicy = params.orgPreferences?.allowExternalProviderEscalation;
    if (orgPolicy === false) {
      return {
        allowed: false,
        reason:
          'Organisation data-sharing policy prohibits sending private organisational data to external cloud providers (allowExternalProviderEscalation=false).',
      };
    }

    if (params.explicitRequestPermission === false) {
      return {
        allowed: false,
        reason: 'Request explicitly disallowed external provider escalation.',
      };
    }

    if (orgPolicy === true || params.explicitRequestPermission === true) {
      return {
        allowed: true,
        reason: 'External escalation authorised by organisation data-sharing policy and valid credentials.',
      };
    }

    return {
      allowed: false,
      reason:
        'External escalation blocked by default privacy policy: organisation must explicitly enable allowExternalProviderEscalation to send data to external providers.',
    };
  }

  public selectLowestCostLocalModel(
    localModels: ModelRegistryEntry[],
    estimatedInputTokens: number
  ): ModelRegistryEntry | null {
    const eligible = localModels
      .filter(
        (m) =>
          m.provider === 'open_weight' &&
          (m.availability === 'available' || m.availability === 'degraded') &&
          m.contextWindow >= estimatedInputTokens + 512
      )
      .sort((a, b) => {
        const costA = (a.inputPricingPer1M ?? 0) + (a.outputPricingPer1M ?? 0);
        const costB = (b.inputPricingPer1M ?? 0) + (b.outputPricingPer1M ?? 0);
        if (costA !== costB) return costA - costB;
        return b.routingEligibility.priorityWeight - a.routingEligibility.priorityWeight;
      });

    return eligible[0] ?? null;
  }
}
