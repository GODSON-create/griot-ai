# GRIOT AI — Deployment, Supabase PostgreSQL, Cloudflare Quick Tunnel & Lovable Integration Guide

This guide documents both deployment topologies supported by **GRIOT AI Core**:

1. **Topology A — Render Hosted Web Service + Supabase PostgreSQL (`GRIOT_DATABASE_URL`)**
2. **Topology B — Local Windows Host (`0.0.0.0:4100`) + Local SQLite + Local Ollama + Cloudflare Quick Tunnel + Lovable Frontend**

---

## 1. Environment Variables Reference

Never commit real production secrets to version control. Configure these environment variables in your host environment or Render Dashboard (see [`.env.production.example`](../.env.production.example) and [`.env.example`](../.env.example)):

| Variable | Required in Production | Default (Dev) | Purpose |
| :--- | :---: | :---: | :--- |
| `GRIOT_ENV` | **Yes** (`production`) | `development` | Execution environment (`development`, `test`, `production`). |
| `PORT` / `GRIOT_PORT` | Automatic on Render | `4100` | HTTP listen port (`PORT` takes precedence over `GRIOT_PORT`). |
| `GRIOT_HOST` | **Yes** (`0.0.0.0`) | `127.0.0.1` (`0.0.0.0` in prod) | Network bind address (`0.0.0.0` for Render or Cloudflare Quick Tunnel). |
| `GRIOT_JWT_SECRET` | **Yes** (min 32 chars) | Ephemeral dev secret | HMAC-SHA256 secret used to sign and verify GRIOT user JWTs. |
| `GRIOT_VAULT_MASTER_KEY` | **Yes** (min 32 chars) | Ephemeral dev secret | AES-256-GCM master key for per-organisation provider credential vaults. |
| `GRIOT_FILE_SIGNING_SECRET` | **Yes** (min 32 chars) | Ephemeral dev secret | HMAC-SHA256 secret for short-lived private multimodal file URLs. |
| `GRIOT_ALLOWED_ORIGINS` | **Yes** (no `*`) | Lovable + localhost | Comma-separated browser origins allowed by CORS (`https://lovable.dev,https://*.lovable.app,https://*.lovableproject.com`). |
| `GRIOT_DATABASE_URL` | For Supabase/Postgres | Empty (uses SQLite) | PostgreSQL connection string. When set, GRIOT automatically selects the PostgreSQL adapter and applies `migrations/001_griot_phase1_postgres.sql`. |
| `GRIOT_SQLITE_PATH` | For local deployment | `./data/griot.db` | Persistent SQLite database path when `GRIOT_DATABASE_URL` is unset. |
| `GRIOT_PRIVATE_STORAGE_DIR` | Optional | `./storage/private` | Directory for encrypted/private uploaded multimodal files. |
| `GRIOT_STORAGE_DURABLE` | Optional | `false` in prod, `true` in dev | Set to `true` when `GRIOT_PRIVATE_STORAGE_DIR` is mounted on a durable disk. |
| `GRIOT_ALLOW_MOCK_PROVIDERS` | Enforced `false` in prod | `true` in dev/test | Prevents silent mock responses in production. |

---

## 2. Topology A: Render + Supabase PostgreSQL Deployment

### Step 1: Retrieve the Supabase PostgreSQL Connection URI
1. Open your Supabase project dashboard (repurposed WealthTech project for **GRIOT AI**).
2. Navigate to **Project Settings → Database → Connection string → URI**.
3. Copy the **Session Pooler (port 5432)** or **Direct Connection** URI and replace `[YOUR-PASSWORD]` with your database password.
4. Ensure TLS is enabled (GRIOT automatically enforces `ssl: 'require'` for non-localhost PostgreSQL hosts).
5. On startup, GRIOT automatically runs [`migrations/001_griot_phase1_postgres.sql`](../migrations/001_griot_phase1_postgres.sql) idempotently and tracks applied versions in `griot_schema_migrations`.

### Step 2: Deploy on Render
The repository includes [`render.yaml`](../render.yaml) with the exact Render configuration:
- **Runtime**: Node (`NODE_VERSION=22.23.5`)
- **Build Command**: `npm ci && npm run typecheck`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/v1/health`
- **Required Render Secret Environment Variables** (`sync: false`):
  - `GRIOT_DATABASE_URL`
  - `GRIOT_JWT_SECRET`
  - `GRIOT_VAULT_MASTER_KEY`
  - `GRIOT_FILE_SIGNING_SECRET`
  - At least one live model provider key (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, or a remote `OPEN_WEIGHT_BASE_URL` + `OPEN_WEIGHT_API_KEY`) when running on Render without a local Ollama daemon.

---

## 3. Topology B: Local Windows Deployment + Cloudflare Quick Tunnel + Lovable Frontend

### Step 1: Start Local Ollama (`qwen2.5:0.5b`)
In Windows PowerShell:
```powershell
$env:PATH = "$env:LOCALAPPDATA\Programs\Ollama;C:\Users\HP\AppData\Local\Programs\mingit\cmd;C:\Users\HP\AppData\Local\Programs\node-v22;" + $env:PATH
$env:OLLAMA_VULKAN = "0"
$env:GGML_VK_VISIBLE_DEVICES = "-1"
$env:OLLAMA_HOST = "127.0.0.1:11434"
ollama serve
```

### Step 2: Start GRIOT AI Backend on Port `4100`
Open a second PowerShell window in `c:\Users\HP\Downloads\GRIOT`. Set your own locally generated operator secrets (never commit them):
```powershell
$env:PATH = "$env:LOCALAPPDATA\Programs\Ollama;C:\Users\HP\AppData\Local\Programs\mingit\cmd;C:\Users\HP\AppData\Local\Programs\node-v22;" + $env:PATH
$env:GRIOT_ENV = "production"
$env:GRIOT_HOST = "0.0.0.0"
$env:GRIOT_PORT = "4100"
$env:GRIOT_SQLITE_PATH = "./data/griot.db"
$env:GRIOT_PRIVATE_STORAGE_DIR = "./storage/private"
$env:GRIOT_STORAGE_DURABLE = "true"
$env:GRIOT_ALLOWED_ORIGINS = "https://lovable.dev,https://*.lovable.app,https://*.lovableproject.com,http://localhost:3000,http://localhost:5173,http://localhost:4100,http://127.0.0.1:4100"
$env:OPEN_WEIGHT_API_KEY = "local-ollama"
$env:OPEN_WEIGHT_BASE_URL = "http://127.0.0.1:11434/v1"

# Populate these 3 operator secrets in your local shell before running npm start:
# $env:GRIOT_JWT_SECRET = "<YOUR_LOCAL_32_BYTE_HEX_SECRET>"
# $env:GRIOT_VAULT_MASTER_KEY = "<YOUR_LOCAL_32_BYTE_HEX_SECRET>"
# $env:GRIOT_FILE_SIGNING_SECRET = "<YOUR_LOCAL_32_BYTE_HEX_SECRET>"

npm.cmd start
```

### Step 3: Install & Launch Cloudflare Quick Tunnel (`cloudflared`)
`cloudflared` was checked on this Windows machine and is **not currently installed**.
To install `cloudflared` on Windows PowerShell:
```powershell
winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
```
Then expose local port `4100` over HTTPS using a Cloudflare Quick Tunnel:
```powershell
cloudflared tunnel --url http://localhost:4100
```
- `cloudflared` will output a temporary public HTTPS URL such as `https://<random-words>.trycloudflare.com`.
- **Important**:
  - The Quick Tunnel URL rotates each time `cloudflared` is restarted; update `GRIOT_API_BASE_URL` in Lovable whenever the tunnel restarts.
  - The local Windows machine must remain powered on and connected while Lovable users interact with the tunnel.

---

## 4. Secure API Key Provisioning & Lovable Frontend Connection

### Step 1: Bootstrap an Organisation Owner & Application API Key (Run Locally, Never Print Secrets in Shared Logs)
1. Register your administrator account via `POST http://127.0.0.1:4100/api/v1/auth/register`.
2. Using the returned owner `accessToken`, create a **least-privilege Lovable Application API Key** via `POST http://127.0.0.1:4100/api/v1/organisations/current/api-keys`:
```json
{
  "name": "Lovable Frontend Application Key",
  "scopes": [
    "chat:write",
    "conversations:read",
    "conversations:write",
    "models:read",
    "builder:read",
    "builder:write",
    "files:read",
    "files:write",
    "knowledge:read"
  ],
  "rateLimitRpm": 120
}
```
> **Security Note**: Application API keys are automatically blocked from receiving administrative scopes (`org:admin`, `apikeys:manage`, `models:admin`, `billing:write`, `admin:platform`).

### Step 2: How Lovable Identifies Users Without Spoofing (`POST /api/v1/auth/session-exchange`)
GRIOT **never** trusts an unverified client-supplied `userId` in request bodies (mismatched `userId` payloads are rejected with `HTTP 403 UNVERIFIED_USER_ID_REJECTED`).
Lovable can authenticate users in two ways:
1. **Direct User Auth**: Lovable calls `POST /api/v1/auth/register` or `POST /api/v1/auth/login` and stores the user's `accessToken` (`Authorization: Bearer <user_jwt>`).
2. **Backend/Edge Session Exchange**: Lovable's server/edge function calls `POST /api/v1/auth/session-exchange` with `X-Griot-Api-Key: <GRIOT_API_KEY>` and `{ "externalUserId": "<verified_lovable_user_id>", "email": "...", "displayName": "..." }` to obtain a 1-hour user-scoped GRIOT JWT (`accessToken`) bound to that user and organisation.

### Step 3: Exact Lovable Frontend Configuration
Configure the following in your Lovable project secrets / environment configuration:
- **`GRIOT_API_BASE_URL`**: `https://<your-tunnel-or-render-host>/api/v1` (or root `https://<your-tunnel-or-render-host>` if your client appends `/api/v1/...`)
- **`GRIOT_API_KEY`**: Stored in Lovable Server/Edge secrets (`X-Griot-Api-Key` header)
- **Key Endpoints**:
  - Health & Readiness: `GET /api/v1/health`
  - Local Ollama Runtime Diagnostics: `GET /api/v1/local-runtime`
  - User Session Exchange: `POST /api/v1/auth/session-exchange`
  - General AI Assistance (Sync & SSE Streaming): `POST /api/v1/chat/completions`
  - Conversations: `GET /api/v1/conversations`, `POST /api/v1/conversations`, `GET /api/v1/conversations/:id/messages`, `POST /api/v1/conversations/:id/messages`
  - Guided Builder ("Build with GRIOT"):
    - `GET /api/v1/builder/tools` (`builder:read`)
    - `POST /api/v1/builder/tools/recommend` (`builder:read`)
    - `POST /api/v1/builder/projects` (`builder:write`)
    - `GET /api/v1/builder/projects` (`builder:read`)
    - `GET /api/v1/builder/projects/:id` (`builder:read`)
    - `PATCH /api/v1/builder/projects/:id/requirements` (`builder:write`)
    - `PATCH /api/v1/builder/projects/:id/detail-level` (`builder:write`)
    - `POST /api/v1/builder/projects/:id/submit-result` (`builder:write`)
    - `POST /api/v1/builder/projects/:id/report-error` (`builder:write`)
