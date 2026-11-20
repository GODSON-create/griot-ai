# GRIOT AI — Phase 1 Internal API Design (`/api/v1`)

## 1. Unified Envelope & Versioning

All endpoints are versioned under `/api/v1/*` and return a consistent JSON envelope (except `/content` binary file downloads and `stream: true` Server-Sent Events streams). Every response includes `X-Griot-Api-Version: v1` and `X-Griot-Request-Id`.

### Success Envelope
```json
{
  "success": true,
  "apiVersion": "v1",
  "requestId": "api_9f2a1c...",
  "timestamp": "2026-11-20T14:30:00.000Z",
  "data": { ... },
  "error": null
}
```

### Error Envelope
```json
{
  "success": false,
  "apiVersion": "v1",
  "requestId": "api_9f2a1c...",
  "timestamp": "2026-11-20T14:30:00.000Z",
  "data": null,
  "error": {
    "code": "ROUTING_CONSTRAINT_UNSATISFIED",
    "message": "Requested model 'mistral:mistral-small-latest' cannot satisfy request requirements: missing required input modality 'video'",
    "details": { ... }
  }
}
```

---

## 2. Authentication & Organisation Context Headers

GRIOT supports two first-class authentication mechanisms:

1. **User / Session JWT**:
   `Authorization: Bearer <jwt_token>`
2. **Hashed Organisation API Key**:
   `X-Griot-Api-Key: griot_sk_<prefix>_<secret>` (or `Authorization: Bearer griot_sk_...`)

Optional context headers (validated strictly against membership and key bindings):
- `X-Griot-Org-Id: org_...`
- `X-Griot-Workspace-Id: ws_...`

---

## 3. Endpoint Reference

### A. Health & Readiness
- **`GET /api/v1/health`**
  Returns service status, environment, total/available model counts, and provider configuration presence (`configured: boolean`, masked `keyHint`, `baseUrl`) without exposing secrets.

### B. Authentication & Multi-Tenancy
- **`POST /api/v1/auth/register`**
  Creates a user account, optional personal organisation + default workspace + initial billing account, and returns `{ user, personalOrg, accessToken }`.
- **`POST /api/v1/auth/login`**
  Authenticates email/password against `scrypt` hash and issues an organisation-scoped JWT.
- **`POST /api/v1/organisations`**
  Creates a new organisation (supports `isAvantageInternal: true` for Avantage Group companies and `false` for independent external businesses).
- **`GET /api/v1/organisations/current`**
  Returns the authenticated organisation, workspaces, and 5-tier billing account balances.
- **`PATCH /api/v1/organisations/current/preferences`**
  Updates routing preferences (`preferredProviders`, `blockedProviders`, `preferredModels`, `costOptimizationMode`, `allowResponseCaching`).
- **`POST /api/v1/organisations/current/api-keys`**
  Issues a new API key (`griot_sk_...`), returning `rawKey` once while storing only its SHA-256 hash (`key_hash`) and display prefix (`key_prefix`).
- **`GET /api/v1/organisations/current/api-keys`**
  Lists API keys for the current organisation (never returns raw key secrets).
- **`DELETE /api/v1/organisations/current/api-keys/:keyId`**
  Revokes an API key immediately.
- **`PUT /api/v1/organisations/current/provider-credentials`**
  Encrypts and stores a per-organisation custom provider API key using AES-256-GCM in `provider_credentials_vault`.

### C. Model Registry & Routing Endpoints
- **`GET /api/v1/models`**
  Query parameters: `provider`, `onlyAvailable=true`, `capability`, `modality`.
- **`POST /api/v1/models/select`**
  Executes the 9-factor routing engine dry-run for a given prompt/messages/hints and returns `{ selectedModel, fallbackChain, taskClassification, reasoningComplexity, estimatedInputTokens, rationale }`.
- **`PATCH /api/v1/models/:modelId`**
  Requires `models:admin`. Applies runtime overrides for `availability`, `eligible`, `inputPricingPer1M`, `cachedInputPricingPer1M`, and `outputPricingPer1M`.

### D. Persistent Conversation & Message Endpoints
- **`POST /api/v1/conversations`** — Create a conversation (`{ title, metadata }`).
- **`GET /api/v1/conversations`** — List user's authorised conversations in the active organisation (`?includeArchived=true`).
- **`GET /api/v1/conversations/:conversationId`** — Retrieve conversation metadata and rolling summary state.
- **`PATCH /api/v1/conversations/:conversationId`** — Rename (`{ title }`) or archive (`{ status: "archived" }`) a conversation.
- **`DELETE /api/v1/conversations/:conversationId`** — Permanently delete a conversation and its messages.
- **`GET /api/v1/conversations/:conversationId/messages`** — Retrieve ordered message history with model and usage metadata.
- **`POST /api/v1/conversations/:conversationId/messages`** — Continue a conversation (supports `prompt`, `attachmentFileIds`, `knowledgeBaseIds`, `routingHints`, `tools`, and `stream: true | false`).

### E. Unified Chat Orchestration Endpoint
- **`POST /api/v1/chat/completions`**
  Provider-independent generation endpoint supporting both synchronous JSON and `stream: true` Server-Sent Events (`event: routing`, `event: delta`, `event: completed`, `event: interrupted`).

### F. Multimodal Private File Reference Endpoints
- **`POST /api/v1/files`**
  Uploads `{ originalName, mimeType, contentBase64 }` into the private tenant vault, extracts text where applicable, and returns `{ file, signedAccess }`.
- **`GET /api/v1/files/:fileId`**
  Verifies tenant ownership and returns file metadata + a fresh short-lived HMAC-signed internal download path.
- **`GET /api/v1/files/:fileId/content?token=<signedToken>`**
  Verifies both tenant authentication and the HMAC signature before streaming private file bytes with `Cache-Control: private, no-store`.

### G. Knowledge Base & Permission-Aware Retrieval Endpoints
- **`POST /api/v1/knowledge-bases`** — Create an organisation or workspace knowledge base with role/user ACLs.
- **`GET /api/v1/knowledge-bases`** — List organisation knowledge bases.
- **`POST /api/v1/knowledge-bases/:kbId/documents`** — Ingest a document (`permissionVerified: true` mandatory).
- **`POST /api/v1/knowledge-bases/retrieve`** — Permission-aware hybrid vector + lexical search with `metadataFilter` and `sourceReference` citations.

### H. Usage, Billing & Administrative Observability Endpoints
- **`GET /api/v1/usage`** — Returns organisation token usage, actual vs estimated vs billable costs, provider/model breakdowns, 5-tier credit balances, and budget alerts.
- **`PATCH /api/v1/usage/billing`** — Updates credit bucket allocations and monthly budget limits.
- **`GET /api/v1/admin/observability`** — Requires `admin:observability`. Returns provider status, model availability, traffic volume, error rates, latency p50/p95/p99, API key activity, and privacy-redacted conversation metadata.
- **`POST /api/v1/admin/support/investigate`** — Requires `admin:support_investigate` (`support_auditor` role), `ticketId`, and `reason`. Performs an audited break-glass conversation inspection.
- **`DELETE /api/v1/users/:userId`** — Executes the account deletion and data anonymisation workflow.
