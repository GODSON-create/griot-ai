# GRIOT AI — Local Inference Runtime & Hardware Configuration (Ollama)

## 1. Discovered Development Hardware

All hardware metrics below were measured directly on the development machine via Windows CIM/WMI hardware inspection:

| Component | Discovered Specification | Local Inference Impact |
| :--- | :--- | :--- |
| **Operating System** | Microsoft Windows 11 Pro (`10.0.22631`, 64-bit) | Native support for Ollama Windows binary (`v0.40.16`) and Node.js `v22.23.5`. |
| **CPU** | `AMD Ryzen 5 PRO 4650U with Radeon Graphics` (6 physical cores / 12 logical threads, 2100 MHz base clock) | Capable of running 4-bit quantized (`Q4_K_M`) 1.5B–3B parameter models on CPU threads. |
| **System RAM** | `15.33 GB` Total Physical RAM (`2.05 GB – 5.16 GB` free available RAM during active sessions) | Comfortably accommodates 1.5B (`~1.0 GB` weight footprint) and 3B (`~1.9 GB` weight footprint) models; 7B–8B models (`~4.7–5.5 GB` weights + KV cache) risk memory paging when free RAM drops below 4.5 GB. |
| **GPU & VRAM** | Integrated `AMD Radeon(TM) Graphics` (`0x1636`), `512 MB` dedicated carve-out VRAM, Driver `31.0.21925.1001` | Not a discrete ROCm-supported Radeon RX 7000/9000 GPU (per `docs.ollama.com/gpu.md`). Furthermore, the older integrated Vulkan driver (`31.0.21925.1001`) triggers an access violation (`0xc0000005`) during `llama-server --list-devices` Vulkan probing unless Vulkan probing is disabled. |
| **Disk Storage** | `394.93 GB` free on `C:` | Ample storage for multiple quantized open-weight models. |

---

## 2. Ollama Runtime Installation & Crucial AMD iGPU Stability Fix

### Installed Runtime
- **Ollama Version**: `0.40.16`
- **Binary Location**: `C:\Users\HP\AppData\Local\Programs\Ollama\ollama.exe`
- **Local Loopback Endpoint**: `http://127.0.0.1:11434` (OpenAI-compatible endpoint: `http://127.0.0.1:11434/v1`)

### Hardware Bug Discovered & Remediated (`OLLAMA_VULKAN=0`)
During initial startup of `ollama serve`, Ollama's Vulkan device discovery (`C:\Users\HP\AppData\Local\Programs\Ollama\lib\ollama\vulkan\llama-server.exe --list-devices`) crashed with Windows exception `0xc0000005` on the integrated `AMD Radeon(TM) Graphics (0x1636)` driver and delayed server startup by ~80 seconds.

Following the official guidance in `https://docs.ollama.com/gpu.md` (*"If you encounter any problems with Vulkan based GPUs, you can disable all Vulkan GPUs by setting `OLLAMA_VULKAN=0` or `GGML_VK_VISIBLE_DEVICES=-1`"*), we configured user-level environment variables:

```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_VULKAN", "0", "User")
[System.Environment]::SetEnvironmentVariable("GGML_VK_VISIBLE_DEVICES", "-1", "User")
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "127.0.0.1:11434", "User")
```

With these settings applied, `ollama serve` starts and binds to `127.0.0.1:11434` in **7 milliseconds** with zero crashes.

---

## 3. Security & Network Controls

1. **Loopback-Only Binding**: `OllamaLocalRuntime` (`src/providers/ollamaRuntime.ts`) enforces that the local inference URL resolves to `127.0.0.1`, `localhost`, or `::1`. Any attempt to bind or point `OllamaLocalRuntime` to `0.0.0.0` or a public IP without `allowPublicExposure: true` throws an immediate security policy error.
2. **Concurrency & Queue Protection**: `LocalInferenceConcurrencyController` (`src/economics/concurrencyLimiter.ts`) limits concurrent local CPU inference requests (`maxConcurrent: 2`, `maxQueueDepth: 15`, `queueTimeoutMs: 30000`) so the 6-core CPU and system RAM are never overwhelmed by concurrent requests.
3. **Graceful Degradation**: If the local Ollama server is stopped or a model is not yet pulled, `OllamaLocalRuntime.inspectRuntime()` and `OpenWeightProviderAdapter` return structured status objects and `ProviderError` instances without crashing the GRIOT server.

---

## 4. Pulling & Running Local Models

Once internet/DNS connectivity to `registry.ollama.ai` and Cloudflare R2 is active on the host:

```powershell
# 1. Start the local Ollama daemon (if not already running)
$env:OLLAMA_VULKAN = "0"
$env:GGML_VK_VISIBLE_DEVICES = "-1"
$env:OLLAMA_HOST = "127.0.0.1:11434"
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" serve

# 2. Pull the primary 3B open-weight model (1.9 GB, Apache-2.0 license)
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen2.5:3b

# 3. (Optional) Pull the ultra-fast 1.5B compact model (986 MB, Apache-2.0 license)
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen2.5:1.5b

# 4. Run GRIOT's real local inference verification suite
npm run test:v1
```
