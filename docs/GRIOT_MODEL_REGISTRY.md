# GRIOT AI — Model Registry Specification

## 1. Overview

The **GRIOT Model Registry** (`config/models.registry.json` managed by `src/registry/modelRegistry.ts`) decouples model metadata, capabilities, modalities, context windows, and pricing from application code.

- **Zero Hardcoded Prices or Capabilities**: All metadata lives in `config/models.registry.json` and can be hot-reloaded from disk (`registry.reloadFromDisk()`) or overridden at runtime via the database table `model_registry_overrides` (`PATCH /api/v1/models/:modelId`).
- **Official Vendor List Pricing**: All cloud provider prices in `config/models.registry.json` reflect official published vendor pricing per **1,000,000 tokens in USD**, including cached input token pricing (`cachedInputPricingPer1M`).
- **Self-Hosted / Open-Weight Transparency**: Open-weight models (`open_weight:llama-3.3-70b-instruct`) default to `inputPricingPer1M: null`, `outputPricingPer1M: null`, `availability: "offline"`, and `eligible: false` until an operator deploys an inference endpoint and sets their actual infrastructure cost per 1M tokens.

---

## 2. Registered Models Catalog (`config/models.registry.json`)

| Model ID | Provider | Official Identifier | Context Window | Max Output | Input ($/1M) | Cached Input ($/1M) | Output ($/1M) | Input Modalities | Reasoning Tier | Latency Class | Deployment Type |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `openai:gpt-4o-mini` | `openai` | `gpt-4o-mini` | 128,000 | 16,384 | $0.15 | $0.075 | $0.60 | `text`, `image` | `standard` | `fast` | `cloud_managed_api` |
| `openai:gpt-4o` | `openai` | `gpt-4o` | 128,000 | 16,384 | $2.50 | $1.25 | $10.00 | `text`, `image` | `advanced` | `medium` | `cloud_managed_api` |
| `openai:o3-mini` | `openai` | `o3-mini` | 200,000 | 100,000 | $1.10 | $0.55 | $4.40 | `text` | `deep_reasoning` | `slow` | `cloud_managed_api` |
| `openai:text-embedding-3-small` | `openai` | `text-embedding-3-small` | 8,191 | 0 | $0.02 | $0.02 | $0.00 | `text` | `none` | `fast` | `cloud_managed_api` |
| `gemini:gemini-2.0-flash` | `gemini` | `gemini-2.0-flash` | 1,048,576 | 8,192 | $0.10 | $0.025 | $0.40 | `text`, `image`, `pdf`, `document`, `audio`, `video` | `standard` | `fast` | `cloud_managed_api` |
| `gemini:gemini-2.5-pro` | `gemini` | `gemini-2.5-pro` | 1,048,576 | 65,536 | $1.25 | $0.3125 | $10.00 | `text`, `image`, `pdf`, `document`, `audio`, `video` | `deep_reasoning` | `medium` | `cloud_managed_api` |
| `anthropic:claude-3-5-haiku-20241022` | `anthropic` | `claude-3-5-haiku-20241022` | 200,000 | 8,192 | $0.80 | $0.08 | $4.00 | `text`, `image`, `pdf` | `standard` | `fast` | `cloud_managed_api` |
| `anthropic:claude-3-7-sonnet-20250219` | `anthropic` | `claude-3-7-sonnet-20250219` | 200,000 | 64,000 | $3.00 | $0.30 | $15.00 | `text`, `image`, `pdf`, `document` | `deep_reasoning` | `medium` | `cloud_managed_api` |
| `mistral:mistral-small-latest` | `mistral` | `mistral-small-latest` | 32,768 | 8,192 | $0.10 | $0.10 | $0.30 | `text` | `standard` | `fast` | `cloud_managed_api` |
| `mistral:mistral-large-latest` | `mistral` | `mistral-large-latest` | 128,000 | 16,384 | $2.00 | $2.00 | $6.00 | `text` | `advanced` | `medium` | `cloud_managed_api` |
| `mistral:codestral-latest` | `mistral` | `codestral-latest` | 256,000 | 32,768 | $0.30 | $0.30 | $0.90 | `text` | `advanced` | `fast` | `cloud_managed_api` |
| `open_weight:llama-3.3-70b-instruct` | `open_weight` | `meta-llama/Llama-3.3-70B-Instruct` | 131,072 | 16,384 | `null` (operator-set) | `null` | `null` | `text` | `advanced` | `fast` | `self_hosted_or_compatible_endpoint` |

---

## 3. Updating Model Metadata Without Code Changes

### Method A: Updating `config/models.registry.json`
Edit `config/models.registry.json` (or point `GRIOT_MODEL_REGISTRY_PATH` to an external JSON file) and invoke `core.registry.reloadFromDisk()`.

### Method B: Runtime Database Overrides (`PATCH /api/v1/models/:modelId`)
Authorised administrators (`models:admin` scope) can update model availability, routing eligibility, or pricing at runtime via the API:

```http
PATCH /api/v1/models/open_weight%3Allama-3.3-70b-instruct
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{
  "availability": "available",
  "eligible": true,
  "inputPricingPer1M": 0.12,
  "outputPricingPer1M": 0.25
}
```
Overrides are persisted in the `model_registry_overrides` table and merged automatically on every registry lookup.
