// ============================================================================
// GRIOT AI — SQL DIALECT TRANSLATOR & POSTGRESQL ROW NORMALIZER
// Translates SQLite-style positional parameter queries (?) and transaction
// statements to PostgreSQL ($1, $2, ...) while normalizing JSONB, TIMESTAMPTZ,
// and numeric values so all service queries run identically on both engines.
// ============================================================================

export interface TranslatedQuery {
  skip: boolean;
  sql: string;
  paramCount: number;
}

const NUMERIC_COLUMNS = new Set([
  'c',
  'cnt',
  'total_requests',
  'total_input_tokens',
  'total_output_tokens',
  'total_cached_tokens',
  'cache_hits',
  'fallbacks',
  'avg_latency_ms',
  'total_estimated_cost_usd',
  'total_billable_cost_usd',
  'spent',
  'free_credits_usd',
  'subscription_allowance_usd',
  'prepaid_credits_usd',
  'enterprise_allocation_usd',
  'promotional_credits_usd',
  'monthly_budget_limit_usd',
  'alert_threshold_percent',
  'spending_limit_usd',
  'input_pricing_per_1m',
  'cached_input_pricing_per_1m',
  'output_pricing_per_1m',
  'cost_usd',
  'actual_provider_cost_usd',
  'estimated_cost_usd',
  'billable_cost_usd',
  'rate_limit_rpm',
  'data_retention_days',
  'retention_days',
  'size_bytes',
  'token_count',
  'chunk_index',
  'input_tokens',
  'output_tokens',
  'cached_tokens',
  'duration_ms',
  'latency_ms',
  'interrupted_at_char',
  'current_step_index',
]);

/**
 * Translates a SQLite query into a PostgreSQL-compatible query:
 * - Skips SQLite-only PRAGMA commands
 * - Rewrites BEGIN IMMEDIATE TRANSACTION -> BEGIN
 * - Converts positional `?` placeholders outside string literals/comments into `$1, $2, ...`
 */
export function translateSqliteToPostgres(rawSql: string): TranslatedQuery {
  const trimmed = rawSql.trim();
  if (!trimmed) {
    return { skip: true, sql: '', paramCount: 0 };
  }

  if (/^PRAGMA\b/i.test(trimmed)) {
    return { skip: true, sql: '', paramCount: 0 };
  }

  if (/^BEGIN\s+IMMEDIATE(\s+TRANSACTION)?\s*;?$/i.test(trimmed)) {
    return { skip: false, sql: 'BEGIN;', paramCount: 0 };
  }

  let out = '';
  let paramIndex = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const next = trimmed[i + 1];

    if (inLineComment) {
      out += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      out += ch;
      if (ch === '*' && next === '/') {
        out += '/';
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (ch === '-' && next === '-') {
        out += '--';
        i++;
        inLineComment = true;
        continue;
      }
      if (ch === '/' && next === '*') {
        out += '/*';
        i++;
        inBlockComment = true;
        continue;
      }
    }

    if (ch === "'" && !inDoubleQuote) {
      out += ch;
      if (inSingleQuote && next === "'") {
        out += "'";
        i++;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      out += ch;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (ch === '?' && !inSingleQuote && !inDoubleQuote) {
      paramIndex += 1;
      out += `$${paramIndex}`;
      continue;
    }

    out += ch;
  }

  return {
    skip: false,
    sql: out,
    paramCount: paramIndex,
  };
}

/**
 * Normalizes parameter values before sending to PostgreSQL.
 */
export function normalizePostgresParams(params: unknown[]): unknown[] {
  return params.map((val) => {
    if (val === undefined) return null;
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val;
  });
}

/**
 * Normalizes a PostgreSQL result row so service callers expecting SQLite row semantics
 * receive stringified JSON for `*_json` JSONB columns, ISO-8601 strings for TIMESTAMPTZ Date objects,
 * and numbers for numeric/count columns.
 */
export function normalizePostgresRow(
  row: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!row) return undefined;
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      normalized[key] = null;
      continue;
    }

    if (value instanceof Date) {
      normalized[key] = value.toISOString();
      continue;
    }

    if (typeof value === 'boolean') {
      normalized[key] = value ? 1 : 0;
      continue;
    }

    if (typeof value === 'object' && !(value instanceof Uint8Array)) {
      normalized[key] = JSON.stringify(value);
      continue;
    }

    if (
      typeof value === 'string' &&
      NUMERIC_COLUMNS.has(key) &&
      /^-?\d+(\.\d+)?$/.test(value)
    ) {
      normalized[key] = Number(value);
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

/**
 * Splits a PostgreSQL migration SQL script into individual top-level executable statements,
 * preserving dollar-quoted PL/pgSQL blocks ($$ ... $$) and quoted literals.
 */
export function splitPostgresMigrationStatements(sqlContent: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  for (let i = 0; i < sqlContent.length; i++) {
    const ch = sqlContent[i];
    const next = sqlContent[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !dollarTag) {
      if (ch === '-' && next === '-') {
        i++;
        inLineComment = true;
        continue;
      }
      if (ch === '/' && next === '*') {
        i++;
        inBlockComment = true;
        continue;
      }
    }

    if (!inSingleQuote && !inDoubleQuote && ch === '$') {
      const rest = sqlContent.slice(i);
      const match = rest.match(/^\$([a-zA-Z0-9_]*)\$/);
      if (match) {
        const tag = match[0];
        if (!dollarTag) {
          dollarTag = tag;
          current += tag;
          i += tag.length - 1;
          continue;
        } else if (dollarTag === tag) {
          dollarTag = null;
          current += tag;
          i += tag.length - 1;
          continue;
        }
      }
    }

    if (!dollarTag) {
      if (ch === "'" && !inDoubleQuote) {
        current += ch;
        if (inSingleQuote && next === "'") {
          current += "'";
          i++;
        } else {
          inSingleQuote = !inSingleQuote;
        }
        continue;
      }

      if (ch === '"' && !inSingleQuote) {
        current += ch;
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
    }

    if (ch === ';' && !inSingleQuote && !inDoubleQuote && !dollarTag) {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const trailing = current.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}
