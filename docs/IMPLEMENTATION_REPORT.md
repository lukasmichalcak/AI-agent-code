# Week 4 implementation and measured evidence

Prepared 11 October 2026 from the supplied repository and project brief. Original Git head:
`ea8d85231b986b7199a47139f69c311326d9e90b`. Changes are delivered as a separate runnable
package; no remote push, deployment, signature or transaction submission was performed.

## What is implemented

The frontend now calls a Python/FastAPI backend for natural-language interpretation and
read-only planning. A pinned Node worker provides real ParaSpell and Wormhole SDK reads;
LI.FI route discovery uses its REST API. Ollama serves local inference. The application also
has an explicit fixture mode for reproducible demonstrations and evaluation.

The common typed representation preserves exact chain/token identity, decimals, decimal
amounts and base units, recipients, constraints, candidate steps, fees and fee assets, input
and output, minimum output, duration, expiry, provenance, warnings and raw provider data.
Missing cost components remain unknown. The controller binds tool calls to the validated
request, sums input plus gas balances, filters unsafe candidates and blocks arbitrary tools.
The interpreter and planner can run in separate contexts on the same model; the single-agent
condition retains one context. The form baseline performs deterministic selection.

The UI displays real candidates, synthetic labels and readable rejection reasons. It
preserves dialogue/form history but invalidates estimates on relevant edits, account changes,
conversation switches and reload. Cancellation propagates to the backend and bounded workers.
Windows setup, stack launch, smoke, live probe, evaluation and schema-export scripts are
included. Existing SDK analyses, demos and the standalone signed ParaSpell test are preserved.

Coverage is deliberately bounded: six EVM chains, with mainnet/testnet separation, and native
PAS between AssetHubPaseo and PeoplePaseo. Unknown ERC20 representations fail validation;
this is not a general ticker resolver. EVM→Substrate transfers are unsupported. The shared
schema covers both ecosystems but does not demonstrate arbitrary heterogeneous connectivity,
cross-provider route composition, signing or recovery.

## Automated verification

| Check | Result | Scope/evidence |
|---|---:|---|
| Python backend | 33 passed | Controller scenarios, identities/units, constraints, balance/gas, unsafe selection, tool budgets, interpretation, normalizers and HTTP boundary; `evaluation/results/backend-test-final.log` |
| Node adapters | 4 passed | Read-only validation; actual worker against mock RPC checks chain ID and exact units; `adapter-test-final.log` |
| Frontend unit tests | 9 passed | Request validation; `frontend-unit-final.log` |
| Browser tests | 9 passed, 0 skipped | UI, wallet mocks, history, responsive layout, planner mocks and one real frontend proxy→FastAPI fixture pipeline; `browser-tests-final.json` |
| TypeScript/production build | Passed | `frontend-build-final.log`; approximately 510 kB main JS, with Vite's size advisory |
| Python compile/dependency check | Passed | Modules compile; `pip check` reports no broken requirements |

These 55 automated tests are not 55 signed-transfer experiments. Browser wallet/API mocks
are distinguished from the one real HTTP fixture integration test. Chromium headless shell
was used in this Linux environment; the user’s Windows browser was not operated.

Before packaging, duplicate stale Pydantic distribution metadata was removed from the
temporary environment and the dependency lock regenerated to match imported Pydantic
2.11.7 / core 2.33.2. Imports did not change, and backend checks were rerun. Earlier manifest
lock hashes identify the earlier lock file; the delivered lock is the corrected one.

## Model deployment and settings

Actual local CPU inference ran on Ollama 0.40.3. Official model-registry blobs were downloaded
and SHA256-verified because the runtime's built-in pull could not use the managed network.
The Windows setup uses normal `ollama pull`. Model weights and the Linux runtime are not
embedded in this source package. No cloud inference service was used.

| Model | Recorded manifest digest | Quantization |
|---|---|---|
| `qwen3.5:4b` (4.2B metadata) | `d8b0f5e9760cd1682034f292d7ef72ec46f432149be0df7574bf2d6e92e38c04` | Q4_K_M |
| `qwen3.5:2b-q4_K_M` (1.9B metadata) | `1e2d21a4f03ab9e4a9c1976a4b7e88f21de61d65f2c5485d8fde8942be73f1e7` | Q4_K_M |

Both used the final v0.3 prompts, 8192 context, temperature 0, seed 42, thinking disabled,
2048 maximum generated tokens, six planner rounds and twelve tool calls. Both passed a
native function-call format smoke test. Format acceptance is separate from semantic success.
For example, 4B unnecessarily asked for the explicitly supplied PAS amount, while 2B called
a nonzero example address a zero address and described an SS58 address as Ethereum-style.

The supplied laptop is Windows 11 / i5-9300H / 32 GB RAM / GTX 1650 (~3935 MB VRAM).
The measurements here come from a separate Linux CPU runtime. `/api/ps` reported zero VRAM
residency for both models. Latest sampled combined Ollama-process RSS peaks were ~5.58 GiB
for 4B and ~2.33 GiB for 2B. System-used RAM peaks were ~6.00 / ~2.98 GiB. These include
other activity and can double-count shared pages; they are not isolated memory requirements.
No laptop GPU benchmark, energy consumption or monetary inference cost was measured.

## Controlled dataset and results

Dataset v0 contains 20 synthetic tasks: 12 development and 8 reserved test tasks, with
English/Slovak utterances, exact assets, balances, candidate responses, fixed clock and oracle.
Coverage includes ambiguity, wrong amount/chain, insufficient input/gas, expiry, unknown
fees, wrapping, fee/minimum-output/duration limits, provider outage and hostile tool text.
Runtime tool fixtures contain no oracle fields. Real provider state is not used for these scores.

The following runs are exploratory. One reserved case was exposed in an interrupted v0.2
development run; the entire test split cannot be called strictly unseen or preregistered.
Earlier prompts and interrupted traces are retained rather than erased. The final single-agent
run also fixes a contradictory extraction instruction. Broader source hashes can differ due
to UI, adapter guards, scripts and the corrected dependency lock; inspect manifests per run.
No case-specific answers were inserted into the prompts.

| Configuration | Tasks × repeats | Correct final system outcomes | Original bounded-workflow oracle | Completion audit | Mean elapsed time |
|---|---:|---:|---:|---:|---:|
| Deterministic form baseline, all tasks | 20 × 3 | 60/60 | 60/60 | 60/60 | <0.01 s, fixture calls only |
| 4B two-role, reserved split | 8 × 1 | 7/8 | 4/8 | 3/8 | 46.95 s |
| 4B single-agent, reserved split | 8 × 1 | 8/8 | 5/8 | 3/8 | 60.39 s |
| 4B two-role, paired development subset | 3 × 3 | 6/9 | 6/9 | 6/9 | 19.44 s |
| 2B Q4 two-role, same paired subset | 3 × 3 | 3/9 | 3/9 | 3/9 | 8.93 s |

The paired subset is `01-native`, `02-paseo-sk`, `04-ambiguous-token`. 4B succeeded in all
three English and ambiguous-token attempts and failed all three PAS attempts. 2B failed
all English and PAS attempts and returned clarification in all ambiguous-token attempts.
That field-based oracle does not validate explanation quality; the erroneous 2B clarification
above shows why 3/9 cannot be read as three useful responses. Faster refusal also shortens
latency, so the time difference is not a comparison of equally completed workflows.

The original `workflowSuccess` checks exact parsed intent, expected status/selection, no
execution, no blocked unsafe proposal/prohibited tool and complete provider comparison.
It can count a correct controller rejection even if the model never calls `finish`.
`completion-audit.json` transparently adds a stricter metric after inspecting this issue:
when planning is required, a valid `finish` result must be observed. Early clarification
or an unsupported corridor needs no finish. Original outcomes, traces and scores are intact;
the added metric is explicitly retrospective. Future evaluations write both measures.

The controller blocked wrong-amount, minimum-output and wrong-chain selections. Those
blocks are controller evidence, not successful agent reasoning. Single-agent's higher final
outcome count does not establish an architectural advantage on eight tasks. The deterministic
baseline receives complete form fields, whereas agents receive natural language; this is an
explicit input difference, not a matched NLP comparison. No measured AI advantage is established.

Direct-provider fixture baselines: LI.FI 16/16 applicable tasks, ParaSpell 1/1, and Wormhole
0/1 against the **overall cross-provider optimum** on a shared case. The Wormhole candidate
was valid but was not the best overall choice. This is not a general Wormhole failure rate.
All other provider/task combinations are N/A. This is a thin-adapter baseline with common
validation, not a study of the providers' ordinary interfaces.

## Live provider evidence

`live-probe.json` retains the earlier 12-check run: 11 calls succeeded and one Wormhole SDK
balance call failed. A successful call returning zero routes is not a transfer success.
Later probes and failures are retained separately.

| Provider | Observed read-only result | Interpretation |
|---|---|---|
| ParaSpell | Registry, public balance and transfer-info/dry-run produced a native PAS candidate | Live estimate on the bounded Paseo corridor; USD, duration and guaranteed minimum unknown |
| LI.FI | Five Arbitrum→Base USDC routes; EVM testnet connections but zero exact native ETH routes | Connections alone do not establish a quotable pair; no transfer was executed |
| Wormhole | Destination discovery, native→native zero quotes; exact wrapped-pair quote | Native input and wrapped output are different concrete assets |
| Wormhole final retry | SDK balance and manual wrapped-pair quote succeeded | Raw source/output tokens retained; ETA 1,024,005 ms normalized to 1025 s; source/redeem gas and full USD cost unknown |

The final Wormhole record is `wormhole-probe-final.json`; the preceding timeout/empty response
is `wormhole-probe-attempt1.json`. Older `live-probe.json` predates the ETA correction and
source-token check; its raw response is useful evidence, but its old normalized ETA should
not be used. Current regression tests and the final retry verify the corrected normalization.
EVM reads now verify RPC chain ID before balances; custom Substrate genesis hashes are refused.

An actual local-model planner was also wired to live ParaSpell tools using exact form input,
to isolate planning from the failed Slovak parse. The initial attempt timed out at the SDK
and the model repeated a refused duplicate call. Its result and full trace are retained in
`model-live-paraspell-attempt1.json` / `live-model-traces`. The explicit retry completed:
the real 4B planner called the live quote and balance tools, then `finish` with the observed
candidate, and the controller returned `ready`. This is exact form input plus model planning,
not a successful Slovak-language parse. `model-live-paraspell.json` and trace
`a47a26eafe324075b8b47abfad9e0dd5` retain the full evidence. It is one read-only success,
not signed execution or an estimate of provider reliability.
These tests use public inspection accounts and do not require or expose a private key.

## Reproduction and handoff

Start with the root README. `scripts/setup.ps1` installs locked project dependencies and
optionally pulls the model. `scripts/run_local.py` starts frontend/backend/adapter services;
Ollama runs separately. `--fixture` offers a clearly labeled deterministic UI demonstration.
The form baseline needs no model. Chat calls the actual local model in either mode.
`scripts/evaluate.py` resets fixture state and writes per-request JSONL traces, manifests,
per-task/repeat results, token counts and timing. `scripts/audit_results.py` reproduces the
completion audit. The larger experiments can be run with the supplied CLI options.

The package excludes dependency directories, model weights, runtime binaries, Git internals,
actual environment files and browser screenshots. Existing SDK demos may need their own
dependency installation; the new stack setup installs only adapters and frontend/backend.
Public example messages/accounts remain in reproducibility traces. The source manifest and
archive checksum identify the delivered snapshot.

## Relation to the research questions and remaining work

RQ1 now has implemented schemas and three normalized mechanisms, with explicit examples of
information loss/unknown cost and asset mismatch. RQ2 has an implemented two-role workflow,
single-agent and deterministic comparisons, bounded calls and controller-enforced rejection.
RQ3 has a small paired same-family, same-quantization CPU pilot with adverse results preserved.
None of these results completes the thesis's full execution or model-comparison claim.

Remaining laptop-dependent work is to run the supplied setup and smoke/evaluation commands
on Windows, verify the GPU driver and actual offload, and record those manifests. A larger
model is conditional on measured memory/latency; no 9B result is invented. Further research
needs improved targeted clarifications, a genuinely unseen larger dataset, repeated reserved
runs, additional sizes/families and observed human explanation review. Signing would require
the appropriate wallet adapter, a concrete validated-plan approval boundary, refreshed state,
funded disposable accounts, source/destination evidence and recovery handling. The preserved
standalone signed ParaSpell demo is not an agent execution result. No new paper-level finding,
thesis PDF rewrite or twelve-paper review is claimed by this implementation report.
