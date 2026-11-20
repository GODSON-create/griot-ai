-- ============================================================================
-- GRIOT AI — PHASE 1 DATABASE SCHEMA (SQLite / Local & Edge Engine)
-- Strict multi-tenant isolation, RBAC (including platform_admin), locked
-- business models (Avantage Free, Public Freemium, Enterprise Shared),
-- dual branding, persistent conversations, multimodal private file vault,
-- knowledge base RAG, and usage economics ledger.
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_avantage_internal INTEGER NOT NULL DEFAULT 0,
  access_model TEXT NOT NULL DEFAULT 'public_freemium',
  branding_mode TEXT NOT NULL DEFAULT 'griot_standalone',
  parent_group TEXT,
  tier TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'active',
  preferences_json TEXT NOT NULL DEFAULT '{}',
  data_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_platform_admin INTEGER NOT NULL DEFAULT 0,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  personal_org_id TEXT,
  spending_limit_usd REAL,
  retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (personal_org_id) REFERENCES organisations(id)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(org_id, slug),
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organisation_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  spending_limit_usd REAL,
  created_at TEXT NOT NULL,
  UNIQUE(org_id, user_id),
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_credentials (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  workspace_id TEXT,
  created_by_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL DEFAULT '["chat:write","conversations:read","models:read"]',
  spending_limit_usd REAL,
  rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_credentials_vault (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id, provider),
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing_accounts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'USD',
  free_credits_usd REAL NOT NULL DEFAULT 5.0,
  subscription_allowance_usd REAL NOT NULL DEFAULT 0.0,
  prepaid_credits_usd REAL NOT NULL DEFAULT 0.0,
  enterprise_allocation_usd REAL NOT NULL DEFAULT 0.0,
  promotional_credits_usd REAL NOT NULL DEFAULT 0.0,
  monthly_budget_limit_usd REAL,
  alert_threshold_percent REAL NOT NULL DEFAULT 80.0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_registry_overrides (
  model_id TEXT PRIMARY KEY,
  availability TEXT,
  eligible INTEGER,
  input_pricing_per_1m REAL,
  cached_input_pricing_per_1m REAL,
  output_pricing_per_1m REAL,
  custom_config_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  workspace_id TEXT,
  user_id TEXT NOT NULL,
  product_module TEXT NOT NULL DEFAULT 'griot_chat',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  summary_context TEXT NOT NULL DEFAULT '',
  summarised_up_to_sequence INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_user ON conversations(org_id, user_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sequence_num INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  provider TEXT,
  model_id TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'live',
  status TEXT NOT NULL DEFAULT 'completed',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0.0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  interrupted_at_char INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_seq ON messages(conversation_id, sequence_num);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  workspace_id TEXT,
  uploaded_by_user_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  modality TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256_hash TEXT NOT NULL,
  storage_rel_path TEXT NOT NULL,
  extracted_text TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL,
  expires_at TEXT,
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_org ON files(org_id, uploaded_by_user_id);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  workspace_id TEXT,
  created_by_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'organisation',
  allowed_roles_json TEXT NOT NULL DEFAULT '["platform_admin","owner","admin","member","developer"]',
  allowed_user_ids_json TEXT NOT NULL DEFAULT '[]',
  embedding_model TEXT NOT NULL DEFAULT 'local:deterministic-128',
  chunk_size INTEGER NOT NULL DEFAULT 600,
  chunk_overlap INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  title TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'text/plain',
  permission_verified INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'indexed',
  created_at TEXT NOT NULL,
  FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  kb_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_org ON knowledge_chunks(kb_id, org_id);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  workspace_id TEXT,
  user_id TEXT NOT NULL,
  api_key_id TEXT,
  conversation_id TEXT,
  message_id TEXT,
  feature_module TEXT NOT NULL DEFAULT 'griot_chat',
  endpoint_path TEXT NOT NULL DEFAULT '/api/v1/chat/completions',
  applicable_allocation TEXT NOT NULL DEFAULT 'public_freemium',
  execution_mode TEXT NOT NULL DEFAULT 'live',
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  actual_provider_cost_usd REAL,
  estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
  billable_cost_usd REAL NOT NULL DEFAULT 0.0,
  cost_source TEXT NOT NULL,
  credits_breakdown_json TEXT NOT NULL DEFAULT '{}',
  cache_hit INTEGER NOT NULL DEFAULT 0,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_org_created ON usage_ledger(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_user ON usage_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_apikey ON usage_ledger(api_key_id, created_at);

CREATE TABLE IF NOT EXISTS budget_alerts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  threshold_percent REAL NOT NULL,
  consumed_usd REAL NOT NULL,
  limit_usd REAL NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  actor_user_id TEXT,
  actor_api_key_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  ip_address TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(org_id, created_at);
