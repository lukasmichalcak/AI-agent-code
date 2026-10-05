# Relay — frontend milestone

A modest React + TypeScript + Vite frontend for an AI agent-based blockchain interoperability router. The previously empty workspace had no frontend, lockfile, or applicable AGENTS.md instructions. npm is the package manager; commit `package-lock.json` with the source.

## Run locally

Use Node.js 22.12+ (tested with 24.13.1) and npm.

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Open the URL printed by Vite, normally http://127.0.0.1:5173. A browser EVM wallet extension is needed for an actual injected connection. Enable test networks in the wallet. Connection and an observed zero balance need no faucet funds.

## WalletConnect configuration

1. Sign in at https://cloud.reown.com and create a project. Copy its **project ID** (the public identifier, not an API secret).
2. Set `VITE_WALLETCONNECT_PROJECT_ID=your_project_id` in `frontend/.env`.
3. If your Reown project uses an origin allowlist, allow your exact local origin (for example `http://127.0.0.1:5173` and `http://localhost:5173` if you use both).
4. Restart Vite. Select WalletConnect and scan its QR code with a compatible mobile wallet. Approve the requested testnet session.

Without the ID, the connector is omitted and injected wallets remain usable. All `VITE_` values are exposed to the browser. Never put private keys, seeds, signing authority, LLM API keys, or backend secrets here.

## What works

- Wagmi v3 connection hooks with Viem and React Query providers; injected EVM wallet and optional WalletConnect (including its required Ethereum provider package).
- Base Sepolia (84532) and Arbitrum Sepolia (421614), using maintained Viem chain definitions and public RPC URLs. Both use native ETH. These are testnets only.
- Live address, connector, connection state, supported/unsupported chain, disconnect and network switching. Account/network changes update the wallet display without rewriting the manually chosen request.
- Current supported chain's **native gas-token balance**, with loading/error states, manual refresh and 20-second refresh. This is not an ERC-20 balance or a fee estimate. Public RPC availability/rate limits can affect reads.
- Natural-language text retained alongside manually entered fields. There is no LLM parsing. Exact review, inline validation, chain-qualified assets, optional USD fee limit/minimum output and wrapped-token preference. ERC-20 metadata is user supplied and not verified on-chain yet.
- Empty candidate/progress areas. Reusable renderers accept genuine typed candidates and execution records; production renders no invented data. There are no signing controls.

This demonstrates connection, balance reading and request review only. No SDK is integrated. In particular, LI.FI does not support testnet transfers; this demo makes no claim of LI.FI execution. Wormhole and ParaSpell need separate network/SDK work.

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm run test:browser
```

Browser tests use installed Microsoft Edge headlessly via Playwright. If Edge is unavailable, install a Playwright browser and change `channel` in `playwright.config.ts`. Screenshots are written to `test-results/`. Browser test wallet/RPC values are synthetic fixtures confined to `e2e/`, never production data.

Manual wallet checklist: connect and reject a connection; change accounts; switch between both testnets and an unsupported chain; refresh balance; disconnect; reload to check reconnection. For WalletConnect, repeat with your project ID and compatible mobile wallet. Test faucet ETH is only needed if you want a nonzero balance. No funds can be transferred by this milestone.

## Next integration points

- `src/domain/types.ts`: `WalletSession`, ecosystem-specific `AssetId`/`ChainRef`, `TransferIntent`, `RouteCandidate`, `FeeItem` and `TransferExecution`. Monetary/token amounts are decimal strings, avoiding floating-point truncation. Asset identities include chain and contract/native/Substrate identifier. Fees retain their token/unit and whether included in input; gas needs and optional USD total cost are separate. Define conversion/valuation and fee accounting policy before comparing totals.
- `src/integrations/planner.ts`: implement `PlanningService.plan(intent, wallets, signal)` as a backend client. The agent receives original text and the reviewed intent; the separate planner gathers wallet/chain data and multiple provider quotes. Validate backend responses at runtime; reject stale or mismatched intent IDs. Add an explicit plan-request action in `App.tsx`, clear candidates on edits/wallet changes, and pass results to `PlanResults`.
- Implement separate `RouterAdapter.quote` modules for ParaSpell, LI.FI and Wormhole. Resolve/verify ERC-20 contracts and metadata, normalize exact input/output assets (including wrapped alternatives), quote dates/expiry, provider steps, fees, gas needs and warnings. Apply user constraints, explain any unsupported limits, and preserve provider provenance. LI.FI mainnet execution needs its own milestone.
- Add a **separate Substrate wallet adapter** for ParaSpell, with its own session and signer. The EVM Wagmi/WalletConnect session is never a Polkadot signer. Extend the form chain/recipient validation when Substrate chains are supported.
- `PlanResults.tsx` renders candidate comparisons; add selection and a separate quote/approval review after implementing freshness, amount, wallet chain/account, recipient, token metadata, gas, allowance, fee valuation, constraints and simulation checks. Do not treat natural-language text or request review as signing approval.
- Add an execution service only after that boundary: submit approved steps via the matching ecosystem signer, reconcile source receipts, monitor bridge progress and independently verify destination completion. Feed observed hashes/status into `TransferProgress.tsx`; never infer destination completion from source submission alone. Keep approval state bound to an immutable validated quote and revalidate immediately before signing.

Official documentation checked during implementation: [Wagmi wallet guide](https://wagmi.sh/react/guides/connect-wallet), [connection hook](https://wagmi.sh/react/api/hooks/useConnection), [balance hook](https://wagmi.sh/react/api/hooks/useBalance), [WalletConnect connector/provider installation](https://wagmi.sh/react/api/connectors/walletConnect), and [Vite guide](https://vite.dev/guide/).
