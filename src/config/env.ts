// ============================================================================
// GRIOT AI — ENVIRONMENT & SECRET MANAGEMENT
// Never hardcodes provider API keys; never logs or exposes raw secrets.
// ============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderName } from '../types/domain.ts';

export interface GriotConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  sqlitePath: string;
  databaseUrl: string | null;
  privateStorageDir: string;
  modelRegistryPath: string;
  jwtSecret: string;
  vaultMasterKey: string;
  fileSigningSecret: string;
  defaultRateLimitRpm: number;
  maxRequestBytes: number;
  enableResponseCache: boolean;
  cacheTtlSeconds: number;
  allowMockProvidersWhenUnconfigured: boolean;
  requestTimeoutMs: number;
  maxRetriesPerProvider: number;
  providers: Record<
    ProviderName,
    {
      apiKey: string | null;
      baseUrl: string;
    }
  >;
}

let cachedDefaultSecret: string | null = null;
function getDevEphemeralSecret(tag: string): string {
  if (!cachedDefaultSecret) {
    cachedDefaultSecret = crypto.randomBytes(32).toString('hex');
  }
  return crypto.createHmac('sha256', cachedDefaultSecret).update(tag).digest('hex');
}

export function loadDotEnvFile(envFilePath = path.resolve(process.cwd(), '.env')): void {
  if (!fs.existsSync(envFilePath)) {
    return;
  }
  const content = fs.readFileSync(envFilePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export function loadGriotConfig(overrides: Partial<GriotConfig> = {}): GriotConfig {
  loadDotEnvFile();
  const envRaw = (process.env.GRIOT_ENV || process.env.NODE_ENV || 'development').toLowerCase();
  const env: GriotConfig['env'] =
    envRaw === 'production' ? 'production' : envRaw === 'test' ? 'test' : 'development';

  const jwtSecret =
    process.env.GRIOT_JWT_SECRET ||
    (env === 'production' ? '' : getDevEphemeralSecret('griot-jwt'));
  const vaultMasterKey =
    process.env.GRIOT_VAULT_MASTER_KEY ||
    (env === 'production' ? '' : getDevEphemeralSecret('griot-vault'));
  const fileSigningSecret =
    process.env.GRIOT_FILE_SIGNING_SECRET ||
    (env === 'production' ? '' : getDevEphemeralSecret('griot-file-sign'));

  if (env === 'production' && (!jwtSecret || !vaultMasterKey || !fileSigningSecret)) {
    throw new Error(
      'CRITICAL SECURITY ERROR: GRIOT_JWT_SECRET, GRIOT_VAULT_MASTER_KEY, and GRIOT_FILE_SIGNING_SECRET must be explicitly set in production.'
    );
  }

  const baseConfig: GriotConfig = {
    env,
    port: Number(process.env.GRIOT_PORT || 4100),
    host: process.env.GRIOT_HOST || '127.0.0.1',
    sqlitePath:
      process.env.GRIOT_SQLITE_PATH ||
      (env === 'test' ? ':memory:' : path.resolve(process.cwd(), 'data', 'griot.db')),
    databaseUrl: process.env.GRIOT_DATABASE_URL || null,
    privateStorageDir:
      process.env.GRIOT_PRIVATE_STORAGE_DIR ||
      path.resolve(process.cwd(), 'storage', 'private'),
    modelRegistryPath:
      process.env.GRIOT_MODEL_REGISTRY_PATH ||
      path.resolve(process.cwd(), 'config', 'models.registry.json'),
    jwtSecret,
    vaultMasterKey,
    fileSigningSecret,
    defaultRateLimitRpm: Number(process.env.GRIOT_DEFAULT_RATE_LIMIT_RPM || 120),
    maxRequestBytes: Number(process.env.GRIOT_MAX_REQUEST_BYTES || 10 * 1024 * 1024),
    enableResponseCache: (process.env.GRIOT_ENABLE_RESPONSE_CACHE ?? 'true') !== 'false',
    cacheTtlSeconds: Number(process.env.GRIOT_CACHE_TTL_SECONDS || 3600),
    allowMockProvidersWhenUnconfigured:
      process.env.GRIOT_ALLOW_MOCK_PROVIDERS !== undefined
        ? process.env.GRIOT_ALLOW_MOCK_PROVIDERS === 'true'
        : env !== 'production',
    requestTimeoutMs: Number(process.env.GRIOT_REQUEST_TIMEOUT_MS || 30000),
    maxRetriesPerProvider: Number(process.env.GRIOT_MAX_RETRIES_PER_PROVIDER ?? 1),
    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY || null,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || null,
        baseUrl:
          process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || null,
        baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
      },
      mistral: {
        apiKey: process.env.MISTRAL_API_KEY || null,
        baseUrl: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
      },
      open_weight: {
        apiKey:
          process.env.OPEN_WEIGHT_API_KEY ||
          (env === 'development' ? 'local-ollama' : null),
        baseUrl:
          process.env.OPEN_WEIGHT_BASE_URL ||
          process.env.OLLAMA_BASE_URL ||
          'http://127.0.0.1:11434/v1',
      },
    },
  };

  return {
    ...baseConfig,
    ...overrides,
    providers: {
      ...baseConfig.providers,
      ...(overrides.providers || {}),
    },
  };
}

/**
 * Safe credential summary that reports presence, live vs mock status, and masked key hints without ever exposing secrets.
 */
export function inspectConfiguredCredentials(config: GriotConfig): Record<
  ProviderName,
  {
    configured: boolean;
    mode: 'live' | 'mock_fallback' | 'unconfigured';
    baseUrl: string;
    keyHint: string | null;
  }
> {
  const result = {} as Record<
    ProviderName,
    {
      configured: boolean;
      mode: 'live' | 'mock_fallback' | 'unconfigured';
      baseUrl: string;
      keyHint: string | null;
    }
  >;
  const providers: ProviderName[] = ['openai', 'gemini', 'anthropic', 'mistral', 'open_weight'];
  for (const p of providers) {
    const entry = config.providers[p];
    const hasKey = Boolean(entry.apiKey && entry.apiKey.trim().length > 0);
    result[p] = {
      configured: hasKey,
      mode: hasKey
        ? 'live'
        : config.allowMockProvidersWhenUnconfigured
          ? 'mock_fallback'
          : 'unconfigured',
      baseUrl: entry.baseUrl,
      keyHint: hasKey && entry.apiKey ? `${entry.apiKey.slice(0, 3)}***${entry.apiKey.slice(-2)}` : null,
    };
  }
  return result;
}
