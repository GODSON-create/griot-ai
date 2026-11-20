# GRIOT AI (`griot-ai`) — Phase 1: Core AI Infrastructure & Model Orchestration Engine

**GRIOT AI** is the shared AI intelligence and model orchestration infrastructure platform under **Avantage Group**. It provides an accessible conversational AI experience while serving as the unified intelligence, knowledge retrieval, and commercial usage engine powering Avantage Group companies and independent third-party ventures through versioned APIs.

---

## 1. Locked Business Decisions

1. **Avantage Group Access (`avantage_free`)**: **FREE** through authorised Avantage Group organisation accounts (uninterrupted access exempt from credit depletion blocks, with full provider cost and token accounting in the usage ledger).
2. **Public Access (`public_freemium`)**: **FREEMIUM** with configurable free allowances (`free_credits_usd`) and paid usage tiers (`subscription_allowance_usd`, `prepaid_credits_usd`).
3. **Enterprise Deployment (`enterprise_contract`)**: **SHARED infrastructure with strict server-side tenant and data isolation**, dedicated workspaces, encrypted provider credential vaults, and configurable commercial allocations.
4. **Dual Branding**:
   - **`griot_standalone`**: **"GRIOT"** as a standalone global product.
   - **`griot_powered_by_avantage`**: **"GRIOT powered by Avantage"** for corporate, ecosystem, and institutional channels.

---

## 2. Modular Product Expansion Boundaries (`src/products/productModules.ts`)

All six GRIOT product pillars share the unified **GRIOT Core** request pipeline (`Authentication -> Tenant Resolution -> Permission Checks -> Request Classification -> 9-Factor Model Routing -> Provider Execution -> Response Processing -> Usage Accounting -> Audit Logging`):

- **GRIOT Chat** (`griot_chat`) — Everyday conversational intelligence.
- **GRIOT Learn** (`griot_learn`) — Educational intelligence helping builders and professionals master **entrepreneurship, financial education, engineering, technology, and personal development**.
- **GRIOT Business** (`griot_business`) — Enterprise document analysis and permission-aware knowledge retrieval (RAG).
- **GRIOT Develop** (`griot_develop`) — Software engineering, architecture design, and coding assistance.
- **GRIOT API** (`griot_api`) — Versioned multi-provider developer gateway (`/api/v1/*`).
- **GRIOT Agents** (`griot_agents`) — Governed autonomous workflow execution with strict tool-call authorisation.

---

## 3. Quick Start & Commands

### Prerequisites
- **Node.js**: `>= 22.6.0` (verified on `v22.23.5` with native TypeScript execution and built-in `node:sqlite`).

### Configuration
```powershell
Copy-Item .env.example .env
```
- When live provider API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `OPEN_WEIGHT_API_KEY`) are not set in `.env` during local development (`GRIOT_ENV=development` or `test`), GRIOT automatically uses its built-in **Development Mock Adapter** and tags responses and usage ledger records with `"executionMode": "mock"`.
- When live credentials are configured (in `.env` or per-organisation via `PUT /api/v1/organisations/current/provider-credentials`), requests execute against official upstream APIs and are tagged `"executionMode": "live"`.

### Run Typecheck, Tests & Server
```powershell
# Run strict TypeScript typechecking
npm run typecheck

# Run full automated test suite (Unit + HTTP/SSE API + Conditional Live Providers)
npm test

# Start the GRIOT Core HTTP & SSE Server (default port 4100)
npm start
```

---

## 4. Documentation Index

- [GRIOT_ARCHITECTURE.md](./GRIOT_ARCHITECTURE.md) ([docs copy](./docs/GRIOT_ARCHITECTURE.md))
- [GRIOT_MODEL_REGISTRY.md](./GRIOT_MODEL_REGISTRY.md) ([docs copy](./docs/GRIOT_MODEL_REGISTRY.md))
- [GRIOT_API_DESIGN.md](./GRIOT_API_DESIGN.md) ([docs copy](./docs/GRIOT_API_DESIGN.md))
- [GRIOT_COST_ENGINE.md](./GRIOT_COST_ENGINE.md) ([docs copy](./docs/GRIOT_COST_ENGINE.md))
- [GRIOT_SECURITY.md](./GRIOT_SECURITY.md) ([docs copy](./docs/GRIOT_SECURITY.md))
- [GRIOT_IMPLEMENTATION_STATUS.md](./GRIOT_IMPLEMENTATION_STATUS.md) ([docs copy](./docs/GRIOT_IMPLEMENTATION_STATUS.md))
