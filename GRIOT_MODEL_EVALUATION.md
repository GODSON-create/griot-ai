# GRIOT AI — V1 Open-Weight Model Evaluation & Live Benchmark Report

## 1. Discovered Hardware & Runtime Constraints

- **Operating System**: Microsoft Windows 11 Pro (`10.0.22631`, 64-bit)
- **CPU**: `AMD Ryzen 5 PRO 4650U with Radeon Graphics` (`6` physical cores / `12` logical threads @ `2100 MHz`)
- **System RAM**: `15.33 GB` total physical RAM (`2.05 GB – 5.16 GB` available free physical RAM during active desktop/IDE sessions)
- **GPU & VRAM**: Integrated `AMD Radeon(TM) Graphics` (`0x1636`), `512 MB` dedicated carve-out VRAM, driver `31.0.21925.1001` (not a discrete ROCm GPU per `docs.ollama.com/gpu.md`; configured with `OLLAMA_VULKAN=0` and `GGML_VK_VISIBLE_DEVICES=-1` so Ollama runs stably on the 12 CPU threads via `llamacpp`)
- **Storage**: `394.93 GB` free on `C:`
- **Network Connection**: Mobile Hotspot (`Wi-Fi` connected to `Dum's Iphone 6`)

---

## 2. Candidate Models Evaluated & Commercial Licensing

| Model Identifier | Parameters | Quantization & Disk Size | Measured / Required RAM (Weights + 4096 Context) | Licence & Commercial Use Conditions | Assessment on This Machine (`AMD Ryzen 5 PRO 4650U`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`qwen2.5:0.5b`** (`open_weight:qwen2.5-0.5b`) | **494.03M (~0.5B)** | `Q4_K_M` (`397 MB` disk) | **`486 MB` measured in `ollama ps`** (`486,067,403` bytes) | **Apache License 2.0** — Fully permissive commercial use, zero royalty or MAU restrictions. | **DOWNLOADED & VERIFIED LIVE**: Runs at 100% CPU in `486 MB` RAM with ~1.1s average task latency across all 8 V1 task categories. Ideal when free RAM drops to ~2.0 GB or when downloading over mobile hotspot. |
| **`qwen2.5:1.5b`** (`open_weight:qwen2.5-1.5b`) | **1.54B** | `Q4_K_M` (`986 MB` disk) | **~1.3 – 1.6 GB** | **Apache License 2.0** — Fully permissive commercial use. | **REGISTERED BALANCED TIER**: Fits comfortably in 2.5–5.0 GB free RAM with stronger multi-paragraph writing and coding depth. |
| **`qwen2.5:3b`** (`open_weight:qwen2.5-3b`) | **3.09B** | `Q4_K_M` (`1.9 GB` disk) | **~2.4 – 2.8 GB** | **Apache License 2.0** — Fully permissive commercial use. | **REGISTERED 3B–8B RANGE TIER**: Recommended primary 3B model when free system RAM is `>= 3.2 GB`. |
| **`llama3.1:8b` / `qwen2.5:7b`** | **7.6B – 8.0B** | `Q4_K_M` (`4.7 – 4.9 GB` disk) | **~5.6 – 6.4 GB** | Llama 3.1 Community / Apache 2.0 | **HARDWARE LIMITATION DOCUMENTED**: Exceeds typical free physical RAM (`2.05–5.16 GB`) on this laptop, causing Windows pagefile swapping. Should be run via Ollama Cloud (`:cloud`) or GRIOT V2 GPU servers. |

---

## 3. Live Execution Benchmark Results (`qwen2.5:0.5b` on `AMD Ryzen 5 PRO 4650U`)

Measured live via `tests/v1.realLocalInference.test.ts` against `http://127.0.0.1:11434/v1` (`allowMockProvidersWhenUnconfigured: false`):

### A. Memory & Runner Telemetry (`GET http://127.0.0.1:11434/api/ps`)
- **Model Digest**: `a8b0c51577010a279d933d14c2a8ab4b268079d44c5c8830c0a93900f1827c67`
- **Format / Family**: `gguf` / `qwen2` (`494.03M` parameters, `Q4_K_M`)
- **Runner / Processor**: `llamacpp` / `100% CPU` (`size_vram: 0`)
- **Total Loaded Memory Footprint (`size`)**: **`486 MB` (`486,067,403` bytes)** with **`4096` context window**

### B. Task-by-Task Live Execution Verification (All 14 V1 Scenarios Passed in `9.10s` Total)

| # | V1 Scenario Tested | V1 Task Category / State | Live Outcome & Verified Output |
| :--- | :--- | :--- | :--- |
| **1** | **Basic Conversation** | `general_conversation` (`LOCAL_EXECUTION`) | **PASS** — Returned live welcome sentence (`executionMode: 'live'`). |
| **2** | **Professional Writing** | `writing_and_rewriting` (`LOCAL_EXECUTION`) | **PASS** — Drafted two-sentence client partnership thank-you email for Lagos partner. |
| **3** | **Summarisation** | `summarisation` (`LOCAL_EXECUTION`) | **PASS** — Condensed Avantage Group GRIOT launch paragraph into a single summary sentence. |
| **4** | **Text Classification** | `text_classification` (`LOCAL_EXECUTION` + `RESULT_VALIDATION`) | **PASS** — Classified customer review as `POSITIVE` and passed `allowedClassificationLabels` validator. |
| **5** | **Structured Data Extraction** | `structured_data_extraction` (`LOCAL_EXECUTION` + `RESULT_VALIDATION`) | **PASS** — Extracted valid JSON `{"city":"Accra","country":"Ghana"}` and passed `requiredJsonFields` schema check. |
| **6** | **Basic Reasoning** | `basic_reasoning` (`LOCAL_EXECUTION`) | **PASS** — Computed step-by-step bakery net profit (`10 * $15 - $50 = $100`). |
| **7** | **Basic Coding** | `basic_coding_assistance` (`LOCAL_EXECUTION` + `RESULT_VALIDATION`) | **PASS** — Generated `addNumbers(a, b)` JavaScript function and passed `requireCodeBlock` validator. |
| **8** | **Invalid / Unsupported Task** | `unsupported` (`UNSUPPORTED`) | **PASS** — Safely rejected 4K 3D video rendering request with `RoutingConstraintError` (`HTTP 422`). |
| **9** | **Local Server Unavailable / Unpulled Model** | `ProviderError` (`open_weight`) | **PASS** — Structured error handling verified without server crash. |
| **10** | **Malformed Model Response** | `RESULT_VALIDATION` | **PASS** — `ResultValidationEngine` detected malformed JSON and generated corrective retry instructions. |
| **11** | **Timeout & Retry** | `ProviderError` (`timeout`) | **PASS** — Enforced request timeout (`timeoutMs: 1`) cleanly with `AbortController`. |
| **12** | **Conversation Persistence** | `ConversationEngine` | **PASS** — Multi-turn live local conversation persisted in SQLite (`4` messages recorded). |
| **13** | **Usage Ledger Recording** | `UsageAndEconomicsEngine` | **PASS** — Recorded live input/output tokens, duration, `$0.00` external vendor cost, and `executionMode: 'live'`. |
| **14** | **Tenant Isolation** | `AuthService` | **PASS** — Cross-tenant access to live local conversation blocked with `TENANT_ISOLATION_DENIED` (`HTTP 403`). |
