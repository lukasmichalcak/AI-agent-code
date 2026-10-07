# Live SDK demonstration (Windows)

This project pins ParaSpell 14.4.0 and LI.FI 4.10.0. It uses only public addresses. It reads balances, available assets/routes and fees, simulates a Paseo transfer, and requests a LI.FI quote. It never signs or broadcasts a transaction.

## Prepare once

1. Download the ZIP, right-click it, choose **Extract All**, and open the extracted folder containing `package.json`. Do not run scripts from inside the ZIP.
2. Install **Node.js 24 LTS** from <https://nodejs.org/en/download> (Windows installer). Close and reopen Command Prompt after installation.
3. In File Explorer's address bar for the extracted folder, type `cmd` and press Enter. This opens Command Prompt in that folder.
4. Run `node --version` and `npm.cmd --version`. Then run `setup.cmd` (or `npm.cmd ci`). Allow several minutes for the first dependency download. Keep `package-lock.json` alongside `package.json`; `npm ci` uses the exact resolved versions.

No wallet, browser extension, API key or testnet funds are needed. Node 20.19+ may also work, but the verified demonstration uses Node 24.

## Show the supervisor

Run `demo-paraspell.cmd` (or `node demo-paraspell.mjs`) while connected to the internet. Six labeled steps appear:

1. Available PAS assets and AssetHubPaseo destinations.
2. The live PAS balance of public testnet account Alice.
3. The origin and destination fee estimate for 1 PAS from AssetHubPaseo to PeoplePaseo.
4. The unsigned send call built by the SDK, including its encoded call bytes in the saved JSON.
5. A simulation on both chains.
6. Expected receipt and transfer details.

The run writes `paraspell-result.json` with its timestamp and all outputs. Amounts and fees are integer **base units**; PAS has 10 decimals, so 10,000,000,000 base units = 1 PAS. `dryRun` means simulation; it does **not** change either balance. Public Alice is not our signing wallet.

Optionally run `demo-lifi.cmd` (or `node demo-lifi.mjs`). It lists the known testnets, counts connections on one specific testnet pair, and quotes 1 USDC from Arbitrum to Base. The example pair is on **mainnet**, but it is quote-only; it writes `lifi-result.json`. The address in this request is a public placeholder, with no signing ability. A listed testnet does not ensure the selected pair has a route. No LI.FI balance is queried because that SDK's balance helpers need a matching wallet provider and selected tokens.

The LI.FI script filters the chain response to five selected testnet IDs. The list is deliberately scoped and should not be presented as every chain LI.FI supports. The separate three-SDK audit in the capability extract includes Wormhole; this ZIP runs the ParaSpell and LI.FI demonstrations.

## Before the meeting

Run both commands once on the same laptop and network. Verify the six ParaSpell steps and LI.FI quote succeed; the displayed amounts may differ from the 7 October snapshot. Keep the generated JSON files for the appendix. If a service is temporarily unavailable, the script records the error for that step and exits nonzero; retry while online. Firewall or RPC outages can affect the live demonstration.

## What the run proves

The ParaSpell run executes SDK methods for **assets/destinations, balance, fees and send preparation/simulation**. It does not prove an actual finalized transfer. The LI.FI run executes **chain discovery, connectivity and quote/fee** methods; its balance and execution paths require a real wallet integration. A real transfer demonstration would need a wallet you control with testnet assets, a signature, a source transaction hash and a verified destination receipt. These scripts deliberately stop before that step.
