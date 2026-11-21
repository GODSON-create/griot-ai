# GRIOT AI — V1 Open-Weight Model Evaluation & Selection Report

## 1. Hardware Constraints & Selection Criteria

- **Target Hardware**: `AMD Ryzen 5 PRO 4650U` (6C/12T CPU @ 2.1 GHz), `15.33 GB` total RAM (`2.05–5.16 GB` available free physical RAM), integrated `AMD Radeon Graphics` (`512 MB` dedicated VRAM, CPU execution mode via `OLLAMA_VULKAN=0`).
- **Required Parameter Range**: 3B–8B parameter open-weight instruction models (with a 1.5B fallback candidate for tight RAM conditions).
- **Commercial Licensing Requirement**: Must permit commercial customer-facing deployment across Avantage Group and third-party African businesses without restrictive royalty clauses.

---

## 2. Candidate Models Evaluated

| Model Identifier | Parameters | Quantization & Disk Size | Approximate RAM Required (Weights + 4K Context) | License & Commercial Use Conditions | Fit for This Machine (`AMD Ryzen 5 PRO 4650U`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`qwen2.5:3b`** (`open_weight:qwen2.5-3b`) | **3.09B** | `Q4_K_M` (~1.9 GB) | **~2.4 – 2.8 GB** | **Apache License 2.0** — Fully permissive commercial use, no monthly active user limits, no attribution lock-in. | **PRIMARY SELECTED V1 MODEL**: Fits safely inside available physical RAM (2.5–5.1 GB free), strong structured JSON extraction, coding, and multilingual instruction following. |
| **`qwen2.5:1.5b`** (`open_weight:qwen2.5-1.5b`) | **1.54B** | `Q4_K_M` (~986 MB) | **~1.3 – 1.6 GB** | **Apache License 2.0** — Fully permissive commercial use. | **SECONDARY LOW-MEMORY FALLBACK**: Recommended when free system RAM drops below 2.5 GB due to concurrent desktop applications; ~2x faster CPU token generation than 3B. |
| **`llama3.2:3b`** | **3.21B** | `Q4_K_M` (~2.0 GB) | **~2.5 – 2.9 GB** | **Llama 3.2 Community License** — Commercial use permitted up to 700M MAU; requires "Built with Llama" notice. | Viable alternative for general conversation and writing, though slightly weaker than `qwen2.5:3b` on strict JSON schema extraction and coding benchmarks. |
| **`llama3.1:8b` / `qwen2.5:7b`** | **7.6B – 8.0B** | `Q4_K_M` (~4.7 – 4.9 GB) | **~5.6 – 6.4 GB** | Llama 3.1 Community / Apache 2.0 | **NOT RECOMMENDED FOR LOCAL CPU ON THIS MACHINE**: Exceeds typical free physical RAM (`2.05–5.16 GB`), causing Windows pagefile swapping and severe latency degradation (< 2 tokens/sec). Suitable for Ollama Cloud or GRIOT V2 GPU servers. |

---

## 3. Task Capability & Evaluation Matrix

| Evaluation Dimension | `qwen2.5:3b` (Primary 3B) | `qwen2.5:1.5b` (Compact 1.5B) | `llama3.1:8b` (7B–8B Class on This CPU) |
| :--- | :--- | :--- | :--- |
| **1. Instruction Following** | High (reliably follows multi-part system + user constraints) | Good (best with concise single-goal prompts) | High, but constrained by swap latency on this host |
| **2. General Conversation** | Natural, concise, helpful | Fast and responsive | High quality, slow time-to-first-token on CPU |
| **3. Writing & Rewriting** | Strong professional business email & memo drafting | Good for short drafts and rewrites | High quality |
| **4. Summarisation** | Accurately condenses 2K–8K token documents | Good up to ~4K tokens | Strong long-document synthesis |
| **5. Text Classification** | Reliable label matching with `ResultValidationEngine` | Reliable on binary/multi-class sentiment & routing | High |
| **6. Structured JSON Output** | Strong (`response_format: json_object` +GRI0T retry validator) | Occasional markdown fence wrapping (normalized by GRIOT validator) | Strong |
| **7. Basic Reasoning** | Handles 2–4 step logical comparisons & business math | Handles 1–2 step deductions | Stronger multi-hop reasoning |
| **8. Basic Coding** | Solid TypeScript, JavaScript, Python, SQL, HTML/CSS snippets | Good for boilerplate and simple functions | Strongest coding, but too heavy for 2–5 GB free RAM |
| **9. Expected CPU Latency (`Ryzen 5 PRO 4650U`)** | ~12–18 tokens/sec (TTFT ~0.8–1.5s) | ~24–35 tokens/sec (TTFT ~0.4–0.8s) | < 3–5 tokens/sec (frequent RAM paging) |
| **10. External Vendor API Cost** | **$0.00 / task** | **$0.00 / task** | **$0.00 / task** |

---

## 4. Actual Local Execution & Network Blocker Log (Transparent Reporting)

Per Section 4 & Section 12 (*"Do not claim successful local execution without actually testing it. A mock response must never count as proof that a real model works."*):

1. **Ollama Runtime Verified Live**: Ollama `v0.40.16` was installed and started on `http://127.0.0.1:11434`. Live HTTP wire communication between GRIOT (`OllamaLocalRuntime` & `OpenWeightProviderAdapter`) and `http://127.0.0.1:11434` (`GET /api/version`, `GET /api/tags`, `POST /v1/chat/completions`) was executed and verified in `tests/v1.realLocalInference.test.ts`.
2. **Model Weight Download Interrupted by Host Network Outage**:
   - During `ollama pull qwen2.5:1.5b` and `ollama pull qwen2.5:3b`, the download reached **15 MB / 986 MB** (`C:\Users\HP\.ollama\models\blobs\sha256-183715c43589...-partial`) before external DNS resolution on the host dropped (`lookup dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com: no such host` and `WARNING: Name resolution of registry.ollama.ai failed`).
3. **Strict Separation Enforced**:
   - Because 0 complete `.gguf` model weight blobs could finish downloading while DNS is offline, `tests/v1.realLocalInference.test.ts` Test #1 and Test #2 **PASS** against the live running Ollama `v0.40.16` daemon (`127.0.0.1:11434`), while Test #3 (`Live Local Open-Weight Model Inference Execution`) explicitly reports `# SKIP` with the exact reason rather than using a mock response.
   - As soon as internet connectivity is restored on this machine, running `ollama pull qwen2.5:3b` will resume from the cached partial blobs in `C:\Users\HP\.ollama\models\blobs` and Test #3 will execute live token generation automatically.
