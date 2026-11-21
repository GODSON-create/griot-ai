# GRIOT AI (`griot-ai`) — V1 Local Intelligence & Guided Builder Platform

**GRIOT AI** is the shared AI intelligence and guided-building platform under **Avantage Group**. It empowers individuals, founders, and businesses across Africa and globally across two primary product experiences:

1. **ASK GRIOT** — Conversational AI assistance for questions, writing, summarisation, research, entrepreneurship & financial education (**GRIOT Learn**), planning, structured extraction, and coding assistance (**GRIOT Develop**).
2. **BUILD WITH GRIOT** — A 12-stage guided project creation engine (`src/builder/guidedBuildEngine.ts`) that helps non-technical and technical users build real websites, web applications, mobile apps, automations, and business systems using external creation tools (**Lovable**, **Google Antigravity**, **Replit**, and **n8n / Make**).

> **Defining Product Principle**: *GRIOT makes people capable of using powerful creation tools, even when they have no technical background.*

---

## 1. Locked Business Decisions

1. **Avantage Group Access (`avantage_free`)**: **FREE** through authorised Avantage Group organisation accounts.
2. **Public Access (`public_freemium`)**: **FREEMIUM** with configurable free allowances and paid usage tiers.
3. **Enterprise Deployment (`enterprise_contract`)**: **SHARED infrastructure with strict server-side tenant and data isolation**.
4. **Dual Branding**:
   - **`griot_standalone`**: **"GRIOT"** as a standalone global product.
   - **`griot_powered_by_avantage`**: **"GRIOT powered by Avantage"** for corporate, ecosystem, and institutional channels.

---

## 2. V1 Local Inference Runtime (Ollama) & Hardware Discovery

- **Installed Runtime**: Ollama `v0.40.16` (`C:\Users\HP\AppData\Local\Programs\Ollama\ollama.exe`) running on loopback `http://127.0.0.1:11434` (`http://127.0.0.1:11434/v1`).
- **Discovered Host Hardware**:
  - **OS**: Windows 11 Pro (`10.0.22631`, 64-bit)
  - **CPU**: `AMD Ryzen 5 PRO 4650U with Radeon Graphics` (6 cores / 12 threads @ 2.1 GHz)
  - **RAM**: `15.33 GB` total physical RAM (`2.05–5.16 GB` available free physical RAM)
  - **GPU**: Integrated `AMD Radeon(TM) Graphics` (`512 MB` carve-out VRAM; configured with `OLLAMA_VULKAN=0` and `GGML_VK_VISIBLE_DEVICES=-1` per `docs.ollama.com/gpu.md` to prevent Vulkan iGPU probe crashes)
  - **Storage**: `394.93 GB` free on `C:`
- **Selected Open-Weight Models**:
  - Primary: **`qwen2.5:3b`** (`open_weight:qwen2.5-3b`, 3.09B parameters, `Q4_K_M` ~1.9 GB, **Apache License 2.0**).
  - Compact Low-RAM Fallback: **`qwen2.5:1.5b`** (`open_weight:qwen2.5-1.5b`, 1.54B parameters, `Q4_K_M` ~986 MB, **Apache License 2.0**).

---

## 3. Quick Start & Commands

```powershell
# 1. Run strict TypeScript typechecking
npm run typecheck

# 2. Run all 5 automated test suites (Unit, API, V1 Guided Builder & Task Router, Real Local Ollama Runtime, Conditional Live Providers)
npm test

# 3. Start the GRIOT HTTP, SSE & Web Interface Server (http://127.0.0.1:4100)
npm start
```
Open `http://127.0.0.1:4100/` in your browser to launch the responsive **ASK GRIOT** and **BUILD WITH GRIOT** interface.

---

## 4. Documentation Index

- [GRIOT_ARCHITECTURE.md](./GRIOT_ARCHITECTURE.md)
- [GRIOT_MODEL_REGISTRY.md](./GRIOT_MODEL_REGISTRY.md)
- [GRIOT_V1_ROUTING.md](./GRIOT_V1_ROUTING.md)
- [GRIOT_LOCAL_INFERENCE.md](./GRIOT_LOCAL_INFERENCE.md)
- [GRIOT_MODEL_EVALUATION.md](./GRIOT_MODEL_EVALUATION.md)
- [GRIOT_API_DESIGN.md](./GRIOT_API_DESIGN.md)
- [GRIOT_COST_ENGINE.md](./GRIOT_COST_ENGINE.md)
- [GRIOT_SECURITY.md](./GRIOT_SECURITY.md)
- [GRIOT_IMPLEMENTATION_STATUS.md](./GRIOT_IMPLEMENTATION_STATUS.md)
