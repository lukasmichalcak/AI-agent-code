# First deployment and model-comparison plan

Hardware supplied by the user: Windows 11, ASUS TUF FX505GT, Intel i5-9300H, 32 GB RAM,
NVIDIA GTX 1650 (~3935 MB dedicated VRAM). This is distinct from the Linux CPU environment
used to validate this package. RAM capacity is not GPU residency, and a quantized download
size excludes runtime state/KV cache and other applications.

Use **Qwen3.5:4b** first. It is published in Ollama's official model library, and the publisher
card for Qwen3.5-4B lists Apache 2.0. Keep the chosen tag, resolved digest, quantization and
Ollama version in the run manifest. The tag is mutable; compare recorded digests, not just
labels. The setup/smoke scripts record `/api/tags`, `/api/show`, `/api/ps` and hardware.

| Role in experiment | Candidate | Reason | Required evidence |
|---|---|---|---|
| First deployment | qwen3.5:4b | Matches the provisional project choice; compact local package with documented tools support | Exact schema + tool-call smoke test and task traces on this laptop |
| Smaller paired variant | qwen3.5:2b-q4_K_M | Same-family and Q4_K_M comparison; the default 2B tag resolved to Q8 in this run | Same dataset/prompt/settings and measured quality/resource use |
| Larger conditional variant | qwen3.5:9b | Same-family comparison with more capacity | Actual peak RAM, GPU offload and acceptable latency; CPU offload may be substantial |

This shortlist is a deployment experiment, not a ranking of all open-weight models. The
brief's other model generations remain provisional; no unverified Granite/Gemma/Ministral
release label is pinned in the code. A cross-family extension can follow the first matched
runs after checking publisher license, actual Ollama tag and tool-call behavior.

Start with 8192 context tokens, one model loaded, one Ollama inference request at a time,
temperature 0, seed 42, thinking disabled, output cap 2048. The application is text-only;
no screenshot/vision input is sent. If memory is excessive, try a 4096 context *as a separate
configuration*, not silently halfway through a comparison. If 4B is too slow, start with 2B
and report the change. Do not assume the GTX 1650 holds the entire 4B runtime in VRAM.

PowerShell, before launching/restarting the Ollama application:

```powershell
$env:OLLAMA_NUM_PARALLEL = '1'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
$env:OLLAMA_CONTEXT_LENGTH = '8192'
$env:OLLAMA_NO_CLOUD = 'true'
ollama serve
```

If Ollama is already serving on 11434, exit its tray application before starting a configured
server, or configure persistent user environment variables and restart it. Avoid running two
servers on that port. Default CPU/GPU offload is left to the runtime and is observed rather
than hardcoded. No cloud model or hosted inference API is configured in the router.

Run `benchmark_model.py` for English, Slovak, ambiguous-asset and actual function-call format
checks. Run `evaluate.py` for the real controlled agent workflow. Smoke-test format success
is not benchmark success. Capture cold-start and warm-run latency separately using Ollama
load/eval timings in traces. Inference token counts, latency and resource observations are
separate from route fees. No energy or dollar inference cost is invented.

## Verified primary sources (2026-10-11)

- [Qwen publisher model card](https://huggingface.co/Qwen/Qwen3.5-4B): exact generation and license.
- [Ollama Qwen3.5 library](https://ollama.com/library/qwen3.5): 2B/4B/9B tags and tools support listing.
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling): native `/api/chat` tool-call contract.
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs): JSON-schema output contract.

Observed CPU model outcomes, when available, are in `evaluation/results`; they do not certify
Windows or GTX 1650 performance. The laptop run is the outstanding hardware experiment.

Ollama's current GPU documentation requires an NVIDIA compute capability of at least 5.0
and a recent supported driver (550+ for the applicable CUDA range). Check `nvidia-smi`
on the laptop and inspect `/api/ps` / `ollama ps` for actual CPU/GPU residency. The provided
screenshot does not show the installed driver version. [Hardware support](https://docs.ollama.com/gpu).
Publisher cards for [2B](https://huggingface.co/Qwen/Qwen3.5-2B) and
[9B](https://huggingface.co/Qwen/Qwen3.5-9B) were also checked as candidate identities.
