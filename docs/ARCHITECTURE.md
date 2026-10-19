# Implemented architecture (V0 read-only)

Python 3.12/FastAPI owns validation, intent, planning and trace storage. A Node 22.12+ HTTP
worker owns pinned ParaSpell and Wormhole SDK calls. React/Vite talks to `/api/chat` or
`/api/plan` through a development proxy. Ollama is a local HTTP dependency, not imported
into React. No private key, signing, submission or execution endpoint is exposed.

The two-role configuration gives the interpreter one schema-constrained extraction call with flat model-facing fields. Typed code maps chain/native-asset metadata and asks for missing essentials before constructing the canonical intent.
Its typed intent becomes the planner's input in a separate context. The planner chooses
read-only provider tools, observes results, checks balances and proposes a candidate ID.
Both roles can share one loaded model. This is a sequential two-role prototype, not a
parallel team or an ensemble. The single-agent condition keeps extraction and planning
in one context; the deterministic baseline receives exact form fields.

Controller responsibilities:

- Bind all provider calls to the validated intent, amount, recipient and inspection account.
- Allow only discover, quote, check_balances and finish. Tool arguments cannot contain new
  recipients or amounts. Never execute an arbitrary model function name.
- Preserve decimal strings and exact base-unit integers; validate provider token identities
  and decimals; aggregate input plus same-token gas before balance comparison.
- Reject unknown representation, disallowed wrapping, expired/stale/future quotes, mismatched
  assets or input amounts, unverified/insufficient balances, and unsatisfied hard constraints.
- Treat missing total fees, minimum output or duration as unknown, rather than zero.
- Enforce finite model/tool budgets. Do not silently replace an omitted/invalid agent selection
  with the deterministic choice. This keeps model failures visible in evaluation.
- Keep provider raw data in traces. Only bounded normalized quote data is sent back to the
  planner. Provider warnings can still be hostile text; they are marked untrusted, while code
  prevents them from changing the bound call arguments or authorizing transfers.

`ready` means candidates are ready for **read-only review**, not executable. Incomplete gas
estimation is shown as a warning. A hard fee limit cannot be satisfied by an incomplete fee
estimate. All live quotes lack an execution promise and need fresh state before any future
signing. Synthetic demo mode is explicit and its cards display `Synthetic fixture`.

Traces include timestamps, settings, prompts, tool calls, normalized responses, errors and
outcomes. They can contain user-entered public addresses and messages; they contain no
intentional private-key fields. Keep them local unless reviewing or explicitly publishing
curated evidence. Each request has its own JSONL trace ID. In this V0 UI, estimates are not
persisted across reload, and editing request/account or switching conversations invalidates
estimates; chat/form history remains stored in the user's browser.

Limits: no cross-provider multi-hop synthesis, no Substrate wallet extension integration,
no execution/recovery/attestation monitoring, no live FX valuation for PAS or WTT, no human
usability study, no energy measurement. The common schema represents an SDK route and the
controller compares those routes; it does not claim arbitrary blockchain connectivity.

Before adding execution, require concrete-plan approval, quote/state refresh, SDK-specific
transaction construction, correct wallet ecosystem, explicit signatures, source finality,
destination evidence and uncertainty-aware recovery. The existing standalone signed ParaSpell
demo is preserved separately; it is not connected to this agent.
