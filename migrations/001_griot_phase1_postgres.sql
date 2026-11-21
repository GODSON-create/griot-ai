-- ============================================================================
-- GRIOT AI — PHASE 1 PRODUCTION DATABASE SCHEMA (PostgreSQL + pgvector)
-- Designed for Supabase / Managed PostgreSQL deployments across Avantage Group
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_avantage_internal BOOLEAN NOT NULL DEFAULT FALSE,
  access_model TEXT NOT NULL DEFAULT 'public_freemium',
  branding_mode TEXT NOT NULL DEFAULT 'griot_standalone',
  parent_group TEXT,
  tier TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'active',
  preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  personal_org_id TEXT REFERENCES organisations(id),
  spending_limit_usd NUMERIC(14, 6),
  retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE TABLE IF NOT EXISTS organisation_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  permissions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  spending_limit_usd NUMERIC(14, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE TABLE IF NOT EXISTS api_credentials (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes_json JSONB NOT NULL DEFAULT '["chat:write","conversations:read","models:read"]'::jsonb,
  spending_limit_usd NUMERIC(14, 6),
  rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_credentials_vault (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, provider)
);

CREATE TABLE IF NOT EXISTS billing_accounts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL UNIQUE REFERENCES organisations(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'USD',
  free_credits_usd NUMERIC(14, 6) NOT NULL DEFAULT 5.0,
  subscription_allowance_usd NUMERIC(14, 6) NOT NULL DEFAULT 0.0,
  prepaid_credits_usd NUMERIC(14, 6) NOT NULL DEFAULT 0.0,
  enterprise_allocation_usd NUMERIC(14, 6) NOT NULL DEFAULT 0.0,
  promotional_credits_usd NUMERIC(14, 6) NOT NULL DEFAULT 0.0,
  monthly_budget_limit_usd NUMERIC(14, 6),
  alert_threshold_percent NUMERIC(5, 2) NOT NULL DEFAULT 80.0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_registry_overrides (
  model_id TEXT PRIMARY KEY,
  availability TEXT,
  eligible BOOLEAN,
  input_pricing_per_1m NUMERIC(14, 6),
  cached_input_pricing_per_1m NUMERIC(14, 6),
  output_pricing_per_1m NUMERIC(14, 6),
  custom_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_module TEXT NOT NULL DEFAULT 'griot_chat',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  summary_context TEXT NOT NULL DEFAULT '',
  summarised_up_to_sequence INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_user ON conversations(org_id, user_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  sequence_num INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider TEXT,
  model_id TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'live',
  status TEXT NOT NULL DEFAULT 'completed',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0.0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  interrupted_at_char INTEGER,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_seq ON messages(conversation_id, sequence_num);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  modality TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256_hash TEXT NOT NULL,
  storage_rel_path TEXT NOT NULL,
  extracted_text TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'organisation',
  allowed_roles_json JSONB NOT NULL DEFAULT '["platform_admin","owner","admin","member","developer"]'::jsonb,
  allowed_user_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  embedding_model TEXT NOT NULL DEFAULT 'openai:text-embedding-3-small',
  chunk_size INTEGER NOT NULL DEFAULT 600,
  chunk_overlap INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  title TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'text/plain',
  permission_verified BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'indexed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding vector(1536),
  embedding_json JSONB NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_org ON knowledge_chunks(kb_id, org_id);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
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
  actual_provider_cost_usd NUMERIC(14, 8),
  estimated_cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0.0,
  billable_cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0.0,
  cost_source TEXT NOT NULL,
  credits_breakdown_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_org_created ON usage_ledger(org_id, created_at);

CREATE TABLE IF NOT EXISTS budget_alerts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  threshold_percent NUMERIC(5, 2) NOT NULL,
  consumed_usd NUMERIC(14, 6) NOT NULL,
  limit_usd NUMERIC(14, 6) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guided_projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  user_objective TEXT NOT NULL,
  project_category TEXT NOT NULL,
  technical_experience TEXT NOT NULL DEFAULT 'complete_beginner',
  budget_constraint TEXT NOT NULL DEFAULT 'free_only',
  selected_tool_id TEXT,
  workflow_state TEXT NOT NULL DEFAULT 'IDEA_CAPTURE',
  detail_level TEXT NOT NULL DEFAULT 'beginner',
  requirements_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  clarifying_questions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  specification_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_check_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ordered_steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  completed_steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_instructions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_results_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  reported_errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions_constraints_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  outstanding_actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  conversation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

