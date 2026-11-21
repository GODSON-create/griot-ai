// ============================================================================
// GRIOT AI — V1 PRACTICAL RESULT VALIDATION ENGINE
// Validates model outputs before delivery:
// - Empty, interrupted, or malformed response detection
// - JSON syntax and required structured fields verification
// - Requested section headings verification
// - Classification label validation
// - Code block verification
// - Bounded corrective retry feedback generation
// ============================================================================

export interface ResultValidationRequirements {
  requireJson?: boolean;
  requiredJsonFields?: string[];
  requiredSections?: string[];
  allowedClassificationLabels?: string[];
  requireCodeBlock?: boolean;
  minLengthChars?: number;
  maxLengthChars?: number;
}

export interface ResultValidationOutcome {
  valid: boolean;
  normalizedContent: string;
  parsedJson?: Record<string, unknown> | unknown[];
  failures: string[];
  correctiveInstruction: string | null;
}

export class ResultValidationEngine {
  /**
   * Extracts JSON from either a raw JSON string or a markdown ```json ... ``` code block.
   */
  public extractJsonCandidate(rawText: string): string {
    const trimmed = rawText.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1].trim();
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
    return trimmed;
  }

  public validate(
    rawContent: string,
    finishReason: string,
    requirements?: ResultValidationRequirements
  ): ResultValidationOutcome {
    const failures: string[] = [];
    const trimmed = (rawContent || '').trim();

    // 1. Detect empty or interrupted responses
    if (!trimmed) {
      failures.push('empty_response: Model returned an empty response.');
    }
    if (finishReason === 'interrupted' || finishReason === 'error') {
      failures.push(`incomplete_finish_reason: Response ended with status '${finishReason}'.`);
    }

    // 2. Detect upstream error leaks masquerading as content
    if (/^(Error:|Traceback \(most recent call last\)|Internal Server Error)/i.test(trimmed)) {
      failures.push('malformed_error_output: Model output appears to be a raw error message.');
    }

    const req = requirements || {};
    if (req.minLengthChars !== undefined && trimmed.length < req.minLengthChars) {
      failures.push(
        `below_min_length: Output length (${trimmed.length}) is shorter than required (${req.minLengthChars}).`
      );
    }
    if (req.maxLengthChars !== undefined && trimmed.length > req.maxLengthChars) {
      failures.push(
        `exceeds_max_length: Output length (${trimmed.length}) exceeds maximum (${req.maxLengthChars}).`
      );
    }

    let normalizedContent = trimmed;
    let parsedJson: Record<string, unknown> | unknown[] | undefined;

    // 3. Validate JSON & required schema fields
    if (req.requireJson || (req.requiredJsonFields && req.requiredJsonFields.length > 0)) {
      const candidate = this.extractJsonCandidate(trimmed);
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed !== 'object' || parsed === null) {
          failures.push('invalid_json_type: Expected a JSON object or array.');
        } else {
          parsedJson = parsed as Record<string, unknown> | unknown[];
          normalizedContent = JSON.stringify(parsed, null, 2);

          if (req.requiredJsonFields && req.requiredJsonFields.length > 0) {
            if (Array.isArray(parsed)) {
              failures.push(
                'schema_mismatch: Expected a JSON object with required fields, but received an array.'
              );
            } else {
              const obj = parsed as Record<string, unknown>;
              for (const field of req.requiredJsonFields) {
                if (
                  !(field in obj) ||
                  obj[field] === undefined ||
                  obj[field] === null ||
                  obj[field] === ''
                ) {
                  failures.push(
                    `missing_required_field: Required JSON field '${field}' is missing or empty.`
                  );
                }
              }
            }
          }
        }
      } catch (err) {
        failures.push(
          `invalid_json_syntax: Response is not valid JSON (${(err as Error).message}).`
        );
      }
    }

    // 4. Check required sections
    if (req.requiredSections && req.requiredSections.length > 0) {
      const lower = trimmed.toLowerCase();
      for (const section of req.requiredSections) {
        if (!lower.includes(section.toLowerCase())) {
          failures.push(
            `missing_required_section: Required section '${section}' was not found in the response.`
          );
        }
      }
    }

    // 5. Check classification labels
    if (req.allowedClassificationLabels && req.allowedClassificationLabels.length > 0) {
      const lower = trimmed.toLowerCase();
      const matched = req.allowedClassificationLabels.some((lbl) =>
        lower.includes(lbl.toLowerCase())
      );
      if (!matched) {
        failures.push(
          `invalid_classification_label: Output did not contain any allowed classification label (${req.allowedClassificationLabels.join(', ')}).`
        );
      }
    }

    // 6. Check code block presence
    if (req.requireCodeBlock) {
      const hasCodeFence = /```[\s\S]+?```/.test(trimmed);
      const hasCodeConstruct =
        /\b(function|const|let|class|def|return|SELECT|CREATE TABLE|import|export)\b/.test(
          trimmed
        );
      if (!hasCodeFence && !hasCodeConstruct) {
        failures.push(
          'missing_code_output: Coding task required code output, but no code block or code construct was detected.'
        );
      }
    }

    const valid = failures.length === 0;
    const correctiveInstruction = valid
      ? null
      : `Your previous response failed GRIOT result validation for the following reasons:\n- ${failures.join('\n- ')}\nPlease regenerate the response strictly satisfying all format and field requirements.`;

    return {
      valid,
      normalizedContent,
      parsedJson,
      failures,
      correctiveInstruction,
    };
  }
}
