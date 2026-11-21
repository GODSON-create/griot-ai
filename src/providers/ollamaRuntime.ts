// ============================================================================
// GRIOT AI — V1 LOCAL INFERENCE RUNTIME INSPECTOR (OLLAMA)
// Detects whether Ollama is installed, whether its local API is reachable,
// identifies installed open-weight models, verifies model availability, and
// enforces loopback-only binding unless public exposure is explicitly approved.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import type { FetchFunction } from './adapter.ts';

export interface InstalledOllamaModel {
  name: string;
  model: string;
  sizeBytes: number;
  digest: string;
  modifiedAt: string;
  parameterSize?: string;
  quantizationLevel?: string;
  family?: string;
}

export interface OllamaRuntimeStatus {
  binaryInstalled: boolean;
  binaryPath: string | null;
  apiReachable: boolean;
  apiBaseUrl: string;
  ollamaVersion: string | null;
  isLoopbackEndpoint: boolean;
  installedModels: InstalledOllamaModel[];
  error: string | null;
  checkedAt: string;
}

export class OllamaLocalRuntime {
  private readonly openAiCompatibleBaseUrl: string;
  private readonly nativeBaseUrl: string;
  private readonly fetchFn: FetchFunction;
  private readonly allowPublicExposure: boolean;

  constructor(params?: {
    baseUrl?: string;
    fetchFn?: FetchFunction;
    allowPublicExposure?: boolean;
  }) {
    const rawBase = (
      params?.baseUrl ||
      process.env.OLLAMA_BASE_URL ||
      process.env.OPEN_WEIGHT_BASE_URL ||
      'http://127.0.0.1:11434/v1'
    ).replace(/\/+$/, '');

    this.openAiCompatibleBaseUrl = rawBase.endsWith('/v1') ? rawBase : `${rawBase}/v1`;
    this.nativeBaseUrl = rawBase.endsWith('/v1') ? rawBase.slice(0, -3) : rawBase;
    this.fetchFn = params?.fetchFn ?? globalThis.fetch;
    this.allowPublicExposure = params?.allowPublicExposure ?? false;

    if (!this.isLoopbackUrl(this.nativeBaseUrl) && !this.allowPublicExposure) {
      throw new Error(
        `Security policy violation: Local inference endpoint (${this.nativeBaseUrl}) must not be exposed to a non-loopback address without explicit security approval.`
      );
    }
  }

  public isLoopbackUrl(urlStr: string): boolean {
    try {
      const u = new URL(urlStr);
      return (
        u.hostname === '127.0.0.1' ||
        u.hostname === 'localhost' ||
        u.hostname === '::1'
      );
    } catch {
      return false;
    }
  }

  public detectBinaryPath(): { installed: boolean; binaryPath: string | null } {
    const candidates: string[] = [];
    if (process.env.LOCALAPPDATA) {
      candidates.push(
        path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe')
      );
    }
    candidates.push(
      'C:\\Users\\HP\\AppData\\Local\\Programs\\Ollama\\ollama.exe',
      '/usr/local/bin/ollama',
      '/usr/bin/ollama',
      '/opt/homebrew/bin/ollama'
    );

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return { installed: true, binaryPath: c };
      }
    }

    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    const exeName = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
    for (const dir of pathDirs) {
      if (!dir) continue;
      const full = path.join(dir, exeName);
      if (fs.existsSync(full)) {
        return { installed: true, binaryPath: full };
      }
    }

    return { installed: false, binaryPath: null };
  }

  public async inspectRuntime(timeoutMs = 3000): Promise<OllamaRuntimeStatus> {
    const bin = this.detectBinaryPath();
    const isLoopback = this.isLoopbackUrl(this.nativeBaseUrl);
    const checkedAt = new Date().toISOString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const versionRes = await this.fetchFn(`${this.nativeBaseUrl}/api/version`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!versionRes.ok) {
        return {
          binaryInstalled: bin.installed,
          binaryPath: bin.binaryPath,
          apiReachable: false,
          apiBaseUrl: this.nativeBaseUrl,
          ollamaVersion: null,
          isLoopbackEndpoint: isLoopback,
          installedModels: [],
          error: `Ollama version endpoint returned HTTP ${versionRes.status}`,
          checkedAt,
        };
      }
      const versionJson = (await versionRes.json()) as { version?: string };
      const tagsRes = await this.fetchFn(`${this.nativeBaseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      const installedModels: InstalledOllamaModel[] = [];
      if (tagsRes.ok) {
        const tagsJson = (await tagsRes.json()) as {
          models?: Array<Record<string, unknown>>;
        };
        for (const m of tagsJson.models || []) {
          const details = (m.details as Record<string, unknown>) || {};
          installedModels.push({
            name: String(m.name || ''),
            model: String(m.model || m.name || ''),
            sizeBytes: Number(m.size || 0),
            digest: String(m.digest || ''),
            modifiedAt: String(m.modified_at || ''),
            parameterSize: details.parameter_size
              ? String(details.parameter_size)
              : undefined,
            quantizationLevel: details.quantization_level
              ? String(details.quantization_level)
              : undefined,
            family: details.family ? String(details.family) : undefined,
          });
        }
      }

      return {
        binaryInstalled: bin.installed,
        binaryPath: bin.binaryPath,
        apiReachable: true,
        apiBaseUrl: this.nativeBaseUrl,
        ollamaVersion: versionJson.version || 'unknown',
        isLoopbackEndpoint: isLoopback,
        installedModels,
        error: null,
        checkedAt,
      };
    } catch (err) {
      return {
        binaryInstalled: bin.installed,
        binaryPath: bin.binaryPath,
        apiReachable: false,
        apiBaseUrl: this.nativeBaseUrl,
        ollamaVersion: null,
        isLoopbackEndpoint: isLoopback,
        installedModels: [],
        error: `Local Ollama server unreachable at ${this.nativeBaseUrl}: ${(err as Error).message}`,
        checkedAt,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public async isModelInstalled(
    modelIdentifier: string,
    timeoutMs = 3000
  ): Promise<{ available: boolean; status: OllamaRuntimeStatus }> {
    const status = await this.inspectRuntime(timeoutMs);
    if (!status.apiReachable) {
      return { available: false, status };
    }
    const target = modelIdentifier.toLowerCase().trim();
    const found = status.installedModels.some((m) => {
      const name = m.name.toLowerCase();
      return (
        name === target ||
        name === `${target}:latest` ||
        name.split(':')[0] === target
      );
    });
    return { available: found, status };
  }

  public getOpenAiCompatibleBaseUrl(): string {
    return this.openAiCompatibleBaseUrl;
  }

  public getNativeBaseUrl(): string {
    return this.nativeBaseUrl;
  }
}
