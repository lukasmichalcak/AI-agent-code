# Provider capability and dependency record

Inspected 2026-10-11 against installed declarations and runtime probes. Package locks are
included. Read `evaluation/results/live-probe.json` for actual responses, fees and times.

| Provider | Implemented route | Bounded V0 coverage | External dependencies | Known limits |
|---|---|---|---|---|
| ParaSpell 14.4.0 | Local Node SDK: getSupportedAssets/getSupportedDestinations, getBalance, Builder.getTransferInfo and dryRun | Native PAS (`native:PAS`, 10 decimals), AssetHubPaseo and PeoplePaseo | Chain WebSocket RPCs and SDK/descriptors registries | Source signer is SS58; EVM WalletConnect cannot sign it. Intermediate-hop or unknown fee assets fail normalization. USD and guaranteed minimum output remain unknown. |
| LI.FI REST v1 | `/connections`, `/advanced/routes`, normalized feeCosts/gasCosts, exact output and minimum output; balance via direct viem RPC | Ethereum, Arbitrum, Base; Sepolia, Base Sepolia, Arbitrum Sepolia; pair availability queried live | Hosted LI.FI route service, optional partner API key, chain HTTP RPCs | SDK version 4.10.0 belongs to preserved demos; backend deliberately uses REST, not SDK executeRoute. API v1 is a service contract, not a frozen server build. Listed chains/connections do not guarantee quotes. No automatic retry for quote rate limits. |
| Wormhole SDK/sdk-connect 6.1.5 | Supported destination tokens, TokenBridgeRoute validate/quote, SDK getBalance; generic balance tool uses viem for all EVM providers | The same six EVM chains, separated into mainnet/testnet; only registered manual TokenBridgeRoute | Chain HTTP RPCs, token-bridge contracts, SDK route registration | Native-source asset often becomes a different wrapped destination contract. No implicit CCTP/NTT/relayer/Mayan packages. Manual destination redemption requires another transaction/signature and gas; these costs are unknown in V0. |

In the recorded probes, ParaSpell public balance and transfer-info/dry-run succeeded. LI.FI
returned five mainnet Arbitrum→Base USDC routes. Base Sepolia→Arbitrum Sepolia native ETH
connections existed, but the route query returned no routes. Wormhole destination discovery
returned a wrapped contract for that source; native ETH→native ETH was therefore not the same
asset pair and yielded no quote. The subsequent explicitly wrapped-pair probe returned a manual TokenBridge quote and is recorded separately. SDK ETA is milliseconds (confirmed in the pinned finality module); the normalized field converts to seconds and retains the raw value. One SDK balance probe later failed, so its retry is retained separately rather than claiming uniform availability. These are time-specific observations, not general reliability claims.

No additional on-chain helper contracts are deployed. No RPC account key is mandatory for
the probes, but public endpoints can rate-limit or fail. Operator RPC overrides (`RPC_<id>`)
are HTTP URLs for EVM clients; the ParaSpell worker uses SDK-default Paseo WebSocket endpoints.
An HTTP-only proxy/firewall can leave HTTP probes working while XCM RPC fails.

Exact ERC20 identity is chain plus contract; decimals are checked by RPC during balance
inspection and against LI.FI/Wormhole metadata during normalization. USD fee components are
summed only when every reported fee/gas component has a valuation. Native and wrapped amounts
are never compared across unlike destination asset IDs. ParaSpell and Wormhole cost omissions
remain visible in the schema/raw response. The controller refuses a capped-fee route if the
whole comparable cost is unknown. Mainnet/testnet mixtures are rejected.

Provider URLs are configured by operator code/settings, never accepted from model arguments.
Worker processes are killed on timeout, closing long-lived RPC connections. At most four
adapter workers run concurrently; the backend limits concurrent requests to two.

## Primary references

- ParaSpell [SDK documentation](https://paraspell.github.io/docs/) and installed 14.4.0 declarations.
- LI.FI [quote versus routes](https://docs.li.fi/introduction/user-flows-and-examples/difference-between-quote-and-route), [API repository/docs](https://docs.li.fi/), and [rate-limit help](https://help.li.fi/hc/en-us/articles/12111455848859-What-is-the-LI-FI-API-rate-limit).
- Wormhole [SDK reference](https://wormhole.com/docs/tools/typescript-sdk/sdk-reference/) and installed 6.1.5 `routes/request`, `types`, `tokenBridge/manual` declarations and source.

A later SDK upgrade needs a new lock, type inspection, probes and normalization regression checks.

EVM balance reads verify `eth_chainId` against the requested chain before using any balance
or ERC20 decimals. Wormhole discovery/quote reads verify both configured HTTP RPC networks.
Substrate identity in V0 uses the pinned SDK's two explicit Paseo names; custom genesis hashes
are not accepted as if independently verified.
