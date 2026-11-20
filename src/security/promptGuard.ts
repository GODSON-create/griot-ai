// ============================================================================
// GRIOT AI — PROMPT INJECTION & TOOL EXECUTION GUARD
// Treats prompts, uploaded documents, and model responses as untrusted input.
// ============================================================================

import type { ChatMessageInput, ToolDefinition } from '../types/domain.ts';

export interface PromptSecurityInspection {
  safe: boolean;
  riskScore: number; // 0.0 to 1.0
  detectedPatterns: string[];
  sanitizedContent: string;
}

const HIGH_RISK_INJECTION_PATTERNS: Array<{ id: string; regex: RegExp; weight: number }> = [
  {
    id: 'ignore_previous_instructions',
    regex: /\b(ignore|disregard|forget|override)\s+(all\s+)?(previous|prior|above|system|developer)\s+(instructions|prompts|rules|directives)\b/i,
    weight: 0.65,
  },
  {
    id: 'system_prompt_exfiltration',
    regex: /\b(reveal|print|output|dump|repeat|expose)\s+(your\s+)?(exact\s+|full\s+|hidden\s+)?(system\s+prompt|developer\s+instructions|api\s+keys?|internal\s+credentials?)\b/i,
    weight: 0.75,
  },
  {
    id: 'privilege_escalation_directive',
    regex: /\b(you\s+are\s+now\s+in\s+developer\s+mode|sudo\s+mode|jailbreak|bypass\s+tenant\s+isolation|execute\s+unauthorised\s+tool)\b/i,
    weight: 0.70,
  },
  {
    id: 'delimiter_spoofing',
    regex: /(<\|im_start\|>\s*system|\[SYSTEM\s+OVERRIDE\]|###\s*SYSTEM\s+INSTRUCTION\s*###)/i,
    weight: 0.80,
  },
];

export function inspectAndSanitizeUntrustedText(
  rawText: string,
  options: { maxChars?: number; blockThreshold?: number; isExternalDocument?: boolean } = {}
): PromptSecurityInspection {
  const maxChars = options.maxChars ?? 250000;
  const blockThreshold = options.blockThreshold ?? 0.65;

  if (typeof rawText !== 'string') {
    return {
      safe: false,
      riskScore: 1.0,
      detectedPatterns: ['non_string_payload'],
      sanitizedContent: '',
    };
  }

  // Strip null bytes and invisible control characters (except \n, \r, \t)
  let cleaned = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (cleaned.length > maxChars) {
    cleaned = cleaned.slice(0, maxChars);
  }

  const detectedPatterns: string[] = [];
  let riskScore = 0;

  for (const rule of HIGH_RISK_INJECTION_PATTERNS) {
    if (rule.regex.test(cleaned)) {
      detectedPatterns.push(rule.id);
      riskScore = Math.min(1.0, riskScore + rule.weight);
    }
  }

  // If external document (e.g., RAG chunk or uploaded file), neutralize embedded delimiter spoofing
  if (options.isExternalDocument && detectedPatterns.length > 0) {
    for (const rule of HIGH_RISK_INJECTION_PATTERNS) {
      cleaned = cleaned.replace(new RegExp(rule.regex.source, 'gi'), '[REDACTED_UNTRUSTED_DIRECTIVE]');
    }
  }

  return {
    safe: riskScore < blockThreshold,
    riskScore,
    detectedPatterns,
    sanitizedContent: cleaned,
  };
}

/**
 * Wraps untrusted retrieved document chunks or user attachments in isolated XML boundaries
 * so models treat them strictly as passive data rather than executable instructions.
 */
export function wrapUntrustedDocumentContext(sourceTitle: string, rawContent: string): string {
  const inspection = inspectAndSanitizeUntrustedText(rawContent, {
    isExternalDocument: true,
  });
  const escapedTitle = sourceTitle.replace(/[<>"']/g, '');
  return `<untrusted_reference_data source="${escapedTitle}" executable="false">\n${inspection.sanitizedContent}\n</untrusted_reference_data>`;
}

/**
 * Validates model tool-call requests against the caller's explicitly authorized tool definitions.
 * Prevents unauthorized tool execution or argument injection.
 */
export function validateModelToolCalls(
  toolCalls: Array<{ id: string; name: string; argumentsJson: string }> | undefined,
  authorizedTools: ToolDefinition[] | undefined
): { valid: boolean; reason?: string } {
  if (!toolCalls || toolCalls.length === 0) {
    return { valid: true };
  }
  if (!authorizedTools || authorizedTools.length === 0) {
    return {
      valid: false,
      reason: 'Model attempted to invoke a tool when no tools were authorized for this request.',
    };
  }
  const allowedMap = new Map(authorizedTools.map((t) => [t.name, t]));
  for (const call of toolCalls) {
    if (!allowedMap.has(call.name)) {
      return {
        valid: false,
        reason: `Unauthorised tool execution blocked: '${call.name}' is not in the authorized tool list.`,
      };
    }
    try {
      const parsed = JSON.parse(call.argumentsJson);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
          valid: false,
          reason: `Tool '${call.name}' arguments must be a valid JSON object.`,
        };
      }
    } catch {
      return {
        valid: false,
        reason: `Tool '${call.name}' arguments are not valid JSON.`,
      };
    }
  }
  return { valid: true };
}

/**
 * Sanitizes model responses before returning or persisting to ensure no internal secrets
 * or dangerous control sequences leak.
 */
export function sanitizeModelOutput(
  output: string,
  knownSecrets: string[] = []
): string {
  let result = output.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  for (const secret of knownSecrets) {
    if (secret && secret.length >= 12 && result.includes(secret)) {
      result = result.split(secret).join('[REDACTED_SECRET]');
    }
  }
  return result;
}

export function validateMessagesPayload(
  messages: ChatMessageInput[],
  maxTotalChars = 500000
): { valid: boolean; reason?: string; riskPatterns: string[] } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, reason: 'Messages array must be non-empty.', riskPatterns: [] };
  }
  let totalChars = 0;
  const riskPatterns: string[] = [];

  for (const msg of messages) {
    if (!['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
      return { valid: false, reason: `Invalid message role: ${String(msg.role)}`, riskPatterns: [] };
    }
    if (typeof msg.content !== 'string') {
      return { valid: false, reason: 'Message content must be a string.', riskPatterns: [] };
    }
    totalChars += msg.content.length;
    if (totalChars > maxTotalChars) {
      return {
        valid: false,
        reason: `Input payload exceeds maximum allowed size (${maxTotalChars} characters).`,
        riskPatterns,
      };
    }
    if (msg.role === 'user') {
      const check = inspectAndSanitizeUntrustedText(msg.content);
      if (!check.safe) {
        return {
          valid: false,
          reason: `Prompt security guard blocked message due to suspected prompt injection (${check.detectedPatterns.join(', ')}).`,
          riskPatterns: check.detectedPatterns,
        };
      }
    }
  }
  return { valid: true, riskPatterns };
}
