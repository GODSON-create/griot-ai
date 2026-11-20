# GRIOT AI — Security, Privacy & Multi-Tenant Governance

## 1. Authentication & Cryptographic Standards (`src/security/crypto.ts`)

- **User Password Hashing**: Passwords are hashed using `crypto.scryptSync` with a 16-byte random salt and verified using constant-time `crypto.timingSafeEqual`.
- **API Key Hashing**: Raw API keys (`griot_sk_<prefix>_<random>`) are returned only once at creation time. Only the **SHA-256 digest** (`key_hash`) and a non-sensitive 8-hex-char prefix (`key_prefix`) are persisted in `api_credentials`.
- **JWT Session Tokens**: Signed with HMAC-SHA256 (`HS256`) using `GRIOT_JWT_SECRET`, binding `sub` (userId), `orgId`, `workspaceId`, `role`, `scopes`, `iat`, and `exp`.
- **Encrypted Provider Secret Vault**: Organisation-specific provider credentials stored in `provider_credentials_vault` are encrypted at rest using **AES-256-GCM** (`iv`, `auth_tag`, `encrypted_secret`) keyed by `GRIOT_VAULT_MASTER_KEY`. Raw provider credentials are never exposed to browsers or returned in API responses.

---

## 2. Strict Multi-Tenant & Role-Based Authorisation (`src/security/auth.ts`)

Every table containing tenant data (`workspaces`, `organisation_members`, `api_credentials`, `provider_credentials_vault`, `billing_accounts`, `conversations`, `messages`, `files`, `knowledge_bases`, `knowledge_documents`, `knowledge_chunks`, `usage_ledger`, `budget_alerts`) is keyed by `org_id`.

- **Cross-Tenant Access Prevention**:
  - API keys bound to Organisation A are rejected with `HTTP 403 TENANT_ISOLATION_DENIED` if used with `X-Griot-Org-Id: <Org_B>`.
  - Conversations, private files, and knowledge bases validate `resource.orgId === auth.orgId` before returning metadata or executing queries, recording an immutable `denied` audit log entry on any cross-tenant attempt.
- **Role-Based Access Control (RBAC)**:
  - `owner` / `admin`: Full organisation management, billing, API keys, model overrides, and aggregate observability.
  - `developer`: Chat orchestration, conversations, files, knowledge bases, API key management, and usage inspection.
  - `member`: Chat orchestration, personal conversations, files, and authorised knowledge retrieval.
  - `billing`: Usage summaries and billing account configuration.
  - `viewer`: Read-only access to authorised conversations, models, and knowledge bases.
  - `support_auditor`: Grants `admin:support_investigate` for audited break-glass security investigations.

---

## 3. Private Multimodal Storage Vault (`src/multimodal/multimodalEngine.ts`)

- Uploaded files are stored outside any public web root in `<GRIOT_PRIVATE_STORAGE_DIR>/<orgId>/<fileId>.vault` with mode `0600` and SHA-256 integrity hashes.
- **No Public Storage URLs**: Files are never exposed via public URLs. Access requires both an authenticated tenant session and a short-lived HMAC-SHA256 signed internal token (`signInternalFileToken`) bound to `(fileId, orgId, userId, expiresAtUnix)`.

---

## 4. Untrusted Input, Prompt Injection & Tool Execution Protections (`src/security/promptGuard.ts`)

GRIOT treats user prompts, uploaded documents, retrieved RAG chunks, and model outputs as untrusted input:

1. **Control Character & Payload Size Sanitisation**: Strips null bytes and control characters and enforces `GRIOT_MAX_REQUEST_BYTES` (`HTTP 413 PAYLOAD_TOO_LARGE`).
2. **Prompt Injection Detection**: Scores incoming user messages against high-risk instruction override, system prompt exfiltration, privilege escalation, and delimiter spoofing patterns, blocking unsafe prompts with `HTTP 400 UNSAFE_PROMPT` and logging to `audit_logs`.
3. **Untrusted Document Isolation**: External documents and RAG excerpts are sanitized and wrapped in `<untrusted_reference_data source="..." executable="false">...</untrusted_reference_data>` boundaries so models treat them strictly as passive data.
4. **Authorised Tool Execution Guard**: `validateModelToolCalls()` verifies every model-generated tool call against the request's explicitly authorised `ToolDefinition[]` list and validates JSON object arguments before returning them to the caller.
5. **Output Secret Redaction**: `sanitizeModelOutput()` scrubs control sequences and any known secret strings before persisting or returning model outputs.

---

## 5. Administrative Privacy, Data Retention & Account Deletion

- **Default Conversation Privacy**: `GET /api/v1/admin/observability` redacts user conversation titles and message contents (`[REDACTED_PRIVATE_USER_CONVERSATION]`) by default.
- **Audited Break-Glass Investigation**: Inspecting conversation contents for security or support incidents requires `POST /api/v1/admin/support/investigate` with the `admin:support_investigate` scope (`support_auditor` role), a mandatory `ticketId`, and a detailed `reason`, generating an immutable `support.break_glass_conversation_inspected` audit log entry.
- **Data Retention Controls**: `audit.enforceDataRetention(orgId)` purges conversations and private vault files older than the organisation's `data_retention_days`.
- **Account Deletion Workflow**: `DELETE /api/v1/users/:userId` revokes the user's API keys, deletes their private vault files and conversations, removes organisation memberships, and anonymises the user row while preserving financial ledger integrity.
