# AI interoperability router first deployment and testing

Runnable read-only prototype added to the supplied repository: local-model interpretation,
bounded provider tools, deterministic validation, frontend integration, 20 labeled scenarios,
matched baseline/model runners, JSONL traces, setup and hardware smoke scripts. Existing SDK
demos and the standalone signed ParaSpell test are preserved. This agent never signs or sends.

## Windows quick start

Install **Python 3.12**, **Node 22.12+** (Node 24 LTS also works), and **Ollama**. Official
installers: [Python](https://www.python.org/downloads/windows/), [Node](https://nodejs.org/en/download),
[Ollama](https://ollama.com/download/windows). With winget, optional installation commands:

```powershell
winget install --id Python.Python.3.12 --exact
winget install --id OpenJS.NodeJS.LTS --exact
winget install --id Ollama.Ollama --exact
```

Open a **new PowerShell** in the extracted repository root and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -PullModel
.\.venv\Scripts\python.exe scripts\run_local.py
```

Open **http://127.0.0.1:5173**. Ollama must be running on 11434 for chat. The setup command
installs project dependencies and pulls `qwen3.5:4b`; it does not install the three system
programs. Read [model settings](docs/MODELS.md) before changing the runtime configuration.

For a reproducible UI demo without RPCs/provider services:

```powershell
.\.venv\Scripts\python.exe scripts\run_local.py --fixture
```

Fixture mode is visibly synthetic. Its single demo corridor is 0.1 native ETH from Base
Sepolia to Arbitrum Sepolia with example account/recipient
`0x1111111111111111111111111111111111111111`. Different requests are not fabricated into
matching fixtures. The form baseline works without Ollama; chat still calls the real local
model. Enter a public source account in the top field, or connect an injected EVM wallet.
An account is sufficient for inspection; no signing approval is requested. For Paseo, enter
a public SS58 account and choose native PAS on the two configured Paseo chains.

WalletConnect is optional. Set `VITE_WALLETCONNECT_PROJECT_ID` in `frontend/.env.local` if you
want it; browser-wallet connection and public-account inspection do not need it. Neither EVM
connector can sign Substrate transactions. Mainnet requests are read-only even though the
existing connected-wallet panel remains limited to the two original EVM testnets.

## Validate and evaluate

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
npm --prefix adapters test
npm --prefix frontend test
npm --prefix frontend run build
# Optional browser install/tests:
cd frontend; npx playwright install chromium; npm run test:browser; cd ..
# Model smoke test and benchmark (Ollama must be running):
.\.venv\Scripts\python.exe scripts\benchmark_model.py --model qwen3.5:4b
.\.venv\Scripts\python.exe scripts\evaluate.py --mode deterministic --split all
.\.venv\Scripts\python.exe scripts\evaluate.py --mode two-role --model qwen3.5:4b --split test --repeats 3
.\.venv\Scripts\python.exe scripts\evaluate.py --mode single-agent --model qwen3.5:4b --split test --repeats 3
```

To probe real read-only services, leave the local stack running and in another terminal run
`python scripts/live_probe.py` using the virtual environment. LI.FI partner keys and EVM
RPC overrides are optional process environment settings documented in `.env.example`.
The root example file is not loaded automatically. Do not put secrets into frontend variables.

Linux/macOS: `python3 -m venv .venv`, install `backend/requirements-lock.txt`, run `npm ci` in
adapters/frontend, then `.venv/bin/python scripts/run_local.py`. Ollama has its own installer.

## Scope, evidence and next work

- [Implementation and validation report](docs/IMPLEMENTATION_REPORT.md)
- [Provider capabilities/dependencies/limits](docs/PROVIDER_COMPATIBILITY.md)
- [Model deployment and comparison](docs/MODELS.md)
- [Architecture and controller behavior](docs/ARCHITECTURE.md)
- [Dataset and comparison protocol](evaluation/README.md)

`ready` is a reviewable read-only quote, not permission or readiness to transact. Quotes,
models, live fees and RPC states vary. Real execution, a Substrate wallet adapter, recovery,
full three-size GPU comparisons and human explanation evaluation remain future milestones.
The included test report distinguishes completed checks, live observations, synthetic tests
and the laptop-dependent experiments. No GitHub push or deployment is performed by the scripts.
