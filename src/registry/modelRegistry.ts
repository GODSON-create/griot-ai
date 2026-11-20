// ============================================================================
// GRIOT AI — CONFIGURABLE MODEL REGISTRY ENGINE
// Dynamically loads model metadata from config/models.registry.json and merges
// database runtime overrides without requiring code changes.
// ============================================================================

import fs from 'node:fs';
import type { GriotDatabase } from '../db/database.ts';
import type {
  ModalityType,
  ModelAvailability,
  ModelCapability,
  ModelRegistryEntry,
  ProviderName,
} from '../types/domain.ts';

interface RegistryFileSchema {
  schemaVersion: string;
  updatedAt: string;
  pricingUnit: string;
  models: ModelRegistryEntry[];
}

export class ModelRegistryService {
  private readonly registryPath: string;
  private readonly database: GriotDatabase;
  private baseModels = new Map<string, ModelRegistryEntry>();

  constructor(registryPath: string, database: GriotDatabase) {
    this.registryPath = registryPath;
    this.database = database;
    this.reloadFromDisk();
  }

  public reloadFromDisk(): void {
    if (!fs.existsSync(this.registryPath)) {
      throw new Error(`Model registry configuration file not found at ${this.registryPath}`);
    }
    const raw = fs.readFileSync(this.registryPath, 'utf8');
    const parsed = JSON.parse(raw) as RegistryFileSchema;
    if (!parsed || !Array.isArray(parsed.models)) {
      throw new Error(`Invalid model registry schema in ${this.registryPath}`);
    }
    const nextMap = new Map<string, ModelRegistryEntry>();
    for (const model of parsed.models) {
      this.validateModelEntry(model);
      nextMap.set(model.id, structuredClone(model));
    }
    this.baseModels = nextMap;
  }

  private validateModelEntry(entry: ModelRegistryEntry): void {
    if (!entry.id || !entry.provider || !entry.modelIdentifier || !entry.displayName) {
      throw new Error(`Model registry entry missing required identity fields: ${JSON.stringify(entry)}`);
    }
    if (typeof entry.contextWindow !== 'number' || entry.contextWindow <= 0) {
      throw new Error(`Model ${entry.id} has invalid contextWindow: ${entry.contextWindow}`);
    }
    if (!Array.isArray(entry.capabilities)) {
      throw new Error(`Model ${entry.id} must declare capabilities array`);
    }
    if (
      !entry.supportedModalities ||
      !Array.isArray(entry.supportedModalities.input) ||
      !Array.isArray(entry.supportedModalities.output)
    ) {
      throw new Error(`Model ${entry.id} must declare supportedModalities.input and output`);
    }
  }

  public listModels(filters?: {
    provider?: ProviderName;
    onlyAvailable?: boolean;
    onlyRoutingEligible?: boolean;
    requiredCapabilities?: ModelCapability[];
    requiredInputModalities?: ModalityType[];
  }): ModelRegistryEntry[] {
    const overrides = this.loadDatabaseOverrides();
    const results: ModelRegistryEntry[] = [];

    for (const baseModel of this.baseModels.values()) {
      const merged = this.mergeOverride(baseModel, overrides.get(baseModel.id));
      if (filters?.provider && merged.provider !== filters.provider) {
        continue;
      }
      if (
        filters?.onlyAvailable &&
        merged.availability !== 'available' &&
        merged.availability !== 'degraded'
      ) {
        continue;
      }
      if (filters?.onlyRoutingEligible && !merged.routingEligibility.eligible) {
        continue;
      }
      if (filters?.requiredCapabilities && filters.requiredCapabilities.length > 0) {
        const hasAllCaps = filters.requiredCapabilities.every((cap) =>
          merged.capabilities.includes(cap)
        );
        if (!hasAllCaps) continue;
      }
      if (filters?.requiredInputModalities && filters.requiredInputModalities.length > 0) {
        const hasAllMods = filters.requiredInputModalities.every((mod) =>
          merged.supportedModalities.input.includes(mod)
        );
        if (!hasAllMods) continue;
      }
      results.push(merged);
    }

    return results;
  }

  public getModelById(modelId: string): ModelRegistryEntry | null {
    const base = this.baseModels.get(modelId);
    if (!base) return null;
    const overrides = this.loadDatabaseOverrides();
    return this.mergeOverride(base, overrides.get(modelId));
  }

  public updateModelOverride(params: {
    modelId: string;
    availability?: ModelAvailability;
    eligible?: boolean;
    inputPricingPer1M?: number | null;
    cachedInputPricingPer1M?: number | null;
    outputPricingPer1M?: number | null;
    customConfig?: Record<string, unknown>;
  }): ModelRegistryEntry {
    const base = this.baseModels.get(params.modelId);
    if (!base) {
      throw new Error(`Model '${params.modelId}' does not exist in registry`);
    }

    const updatedAt = new Date().toISOString();
    const existing = this.loadDatabaseOverrides().get(params.modelId);

    const availability = params.availability ?? existing?.availability ?? null;
    const eligible =
      params.eligible !== undefined
        ? params.eligible
          ? 1
          : 0
        : existing?.eligible !== undefined && existing?.eligible !== null
          ? existing.eligible
            ? 1
            : 0
          : null;
    const inputPrice =
      params.inputPricingPer1M !== undefined
        ? params.inputPricingPer1M
        : existing?.inputPricingPer1M ?? null;
    const cachedPrice =
      params.cachedInputPricingPer1M !== undefined
        ? params.cachedInputPricingPer1M
        : existing?.cachedInputPricingPer1M ?? null;
    const outputPrice =
      params.outputPricingPer1M !== undefined
        ? params.outputPricingPer1M
        : existing?.outputPricingPer1M ?? null;
    const customConfig = params.customConfig ?? existing?.customConfig ?? {};

    this.database.db
      .prepare(
        `INSERT INTO model_registry_overrides (
          model_id, availability, eligible, input_pricing_per_1m,
          cached_input_pricing_per_1m, output_pricing_per_1m, custom_config_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(model_id) DO UPDATE SET
          availability = excluded.availability,
          eligible = excluded.eligible,
          input_pricing_per_1m = excluded.input_pricing_per_1m,
          cached_input_pricing_per_1m = excluded.cached_input_pricing_per_1m,
          output_pricing_per_1m = excluded.output_pricing_per_1m,
          custom_config_json = excluded.custom_config_json,
          updated_at = excluded.updated_at`
      )
      .run(
        params.modelId,
        availability,
        eligible,
        inputPrice,
        cachedPrice,
        outputPrice,
        JSON.stringify(customConfig),
        updatedAt
      );

    return this.getModelById(params.modelId)!;
  }

  public registerDynamicModel(entry: ModelRegistryEntry): ModelRegistryEntry {
    this.validateModelEntry(entry);
    this.baseModels.set(entry.id, structuredClone(entry));
    return this.getModelById(entry.id)!;
  }

  private loadDatabaseOverrides(): Map<
    string,
    {
      availability: ModelAvailability | null;
      eligible: boolean | null;
      inputPricingPer1M: number | null;
      cachedInputPricingPer1M: number | null;
      outputPricingPer1M: number | null;
      customConfig: Record<string, unknown>;
    }
  > {
    const rows = this.database.db
      .prepare(`SELECT * FROM model_registry_overrides`)
      .all() as Array<Record<string, unknown>>;

    const map = new Map();
    for (const r of rows) {
      map.set(String(r.model_id), {
        availability: r.availability ? (String(r.availability) as ModelAvailability) : null,
        eligible:
          r.eligible !== null && r.eligible !== undefined ? Boolean(Number(r.eligible)) : null,
        inputPricingPer1M:
          r.input_pricing_per_1m !== null && r.input_pricing_per_1m !== undefined
            ? Number(r.input_pricing_per_1m)
            : null,
        cachedInputPricingPer1M:
          r.cached_input_pricing_per_1m !== null &&
          r.cached_input_pricing_per_1m !== undefined
            ? Number(r.cached_input_pricing_per_1m)
            : null,
        outputPricingPer1M:
          r.output_pricing_per_1m !== null && r.output_pricing_per_1m !== undefined
            ? Number(r.output_pricing_per_1m)
            : null,
        customConfig: JSON.parse(String(r.custom_config_json || '{}')),
      });
    }
    return map;
  }

  private mergeOverride(
    base: ModelRegistryEntry,
    override?: {
      availability: ModelAvailability | null;
      eligible: boolean | null;
      inputPricingPer1M: number | null;
      cachedInputPricingPer1M: number | null;
      outputPricingPer1M: number | null;
    }
  ): ModelRegistryEntry {
    if (!override) return structuredClone(base);
    const cloned = structuredClone(base);
    if (override.availability !== null) {
      cloned.availability = override.availability;
    }
    if (override.eligible !== null) {
      cloned.routingEligibility.eligible = override.eligible;
    }
    if (override.inputPricingPer1M !== null) {
      cloned.inputPricingPer1M = override.inputPricingPer1M;
    }
    if (override.cachedInputPricingPer1M !== null) {
      cloned.cachedInputPricingPer1M = override.cachedInputPricingPer1M;
    }
    if (override.outputPricingPer1M !== null) {
      cloned.outputPricingPer1M = override.outputPricingPer1M;
    }
    return cloned;
  }
}
