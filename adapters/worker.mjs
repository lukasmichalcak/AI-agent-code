// Each request is isolated in a process; the parent kills it on timeout, closing RPCs.
import { evmChain, validateRequest } from './chains.mjs';
import { createPublicClient, http, erc20Abi, getAddress } from 'viem';
const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
console.log = (...args) => console.error(...args);
const request = JSON.parse(process.argv[2]);
function rpc(chainId) {
  const c = evmChain(chainId);
  return createPublicClient({ chain: c.viem, transport: http(process.env[`RPC_${chainId}`], { timeout: 15000, retryCount: 0 }) });
}
async function evmBalance(asset, address) {
  const client = rpc(asset.chain.chainId);
  const actualChain = await client.getChainId();
  if (actualChain !== asset.chain.chainId) throw new Error('RPC chain ID differs from requested chain');
  const account = getAddress(address);
  if (asset.kind === 'native') return { amountBaseUnits: String(await client.getBalance({ address: account })), decimals: 18 };
  const token = getAddress(asset.address);
  const decimals = await client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' });
  if (decimals !== asset.decimals) throw new Error('Token decimals differ from live contract');
  return { amountBaseUnits: String(await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] })), decimals };
}
async function run() {
  validateRequest(request);
  if (request.provider === 'evm') return evmBalance(request.asset, request.address);
  if (request.provider === 'paraspell') {
    const { Builder, getBalance, getSupportedAssets, getSupportedDestinations } = await import('@paraspell/sdk');
    const a = request.intent?.sourceAsset ?? request.asset;
    if (request.operation === 'discover') return {
      assets: getSupportedAssets(a.chain.name, request.intent.destinationAsset.chain.name),
      destinations: getSupportedDestinations(a.chain.name, { symbol: 'PAS' }), sdk: '14.4.0',
    };
    if (request.operation === 'balance') return { amountBaseUnits: String(await getBalance({ chain: a.chain.name, address: request.address })), decimals: 10 };
    const make = () => Builder().from(a.chain.name).to(request.intent.destinationAsset.chain.name)
      .currency({ symbol: 'PAS', amount: BigInt(request.amountBaseUnits) })
      .recipient(request.intent.recipient).sender(request.sender);
    // Transfer info preserves balance sufficiency, fee asset identity and destination output.
    const info = await make().getTransferInfo();
    const dryRun = await make().dryRun();
    return { info, dryRun, sdk: '14.4.0' };
  }
  const { wormhole, Wormhole, amount } = await import('@wormhole-foundation/sdk');
  const { default: evm } = await import('@wormhole-foundation/sdk/evm');
  const routes = await import('@wormhole-foundation/sdk-connect/routes');
  const a = request.intent?.sourceAsset ?? request.asset;
  const source = evmChain(a.chain.chainId);
  const overrides = Object.fromEntries([... [1,42161,8453,11155111,84532,421614]].filter(id => process.env[`RPC_${id}`]).map(id => [evmChain(id).name, { rpc: process.env[`RPC_${id}`] }]));
  const wh = await wormhole(source.network, [evm], { chains: overrides });
  if (request.operation === 'balance') {
    const checked = await evmBalance(a, request.address); // Verify caller decimals before SDK balance.
    const balance = await wh.getBalance(source.name, a.kind === 'native' ? 'native' : a.address, request.address);
    if (balance === null) throw new Error('Wormhole balance unavailable');
    return { amountBaseUnits: String(balance), decimals: checked.decimals };
  }
  const b = request.intent.destinationAsset;
  const dest = evmChain(b.chain.chainId);
  for (const id of [a.chain.chainId,b.chain.chainId]) {
    if (await rpc(id).getChainId() !== id) throw new Error('Wormhole RPC chain ID differs from requested chain');
  }
  const from = wh.getChain(source.name), to = wh.getChain(dest.name);
  // Deliberately one pinned manual route: no implicit relayer or third-party route package.
  const resolver = wh.resolver([routes.TokenBridgeRoute]);
  const token = Wormhole.tokenId(source.name, a.kind === 'native' ? 'native' : a.address);
  const destinations = await resolver.supportedDestinationTokens(token, from, to);
  const serializeToken = t => ({ chain: t.chain, address: t.address.toString() });
  if (request.operation === 'discover') return { source: serializeToken(token), destinations: destinations.map(serializeToken), routeClasses: ['TokenBridgeRoute'], sdk: '6.1.5' };
  const destToken = Wormhole.tokenId(dest.name, b.kind === 'native' ? 'native' : b.address);
  if (!destinations.some(t => t.chain === destToken.chain && t.address.toString().toLowerCase() === destToken.address.toString().toLowerCase())) return { quotes: [], reason: 'Exact destination token not supported', destinations: destinations.map(serializeToken) };
  const transfer = await routes.RouteTransferRequest.create(wh, { source: token, destination: destToken,
    sender: Wormhole.chainAddress(source.name, request.sender), recipient: Wormhole.chainAddress(dest.name, request.intent.recipient) }, from, to);
  if (transfer.source.decimals !== a.decimals || transfer.destination.decimals !== b.decimals) throw new Error('Token decimals differ from SDK chain metadata');
  const found = await resolver.findRoutes(transfer);
  const quotes = [];
  for (const route of found) {
    const valid = await route.validate(transfer, { amount: request.intent.amount, options: route.getDefaultOptions() });
    if (!valid.valid) continue;
    const quote = await route.quote(transfer, valid.params);
    if (!quote.success) continue;
    quotes.push({ sourceToken: serializeToken(quote.sourceToken.token), route: route.constructor.meta.name, outputBaseUnits: String(amount.units(quote.destinationToken.amount)),
      outputDecimals: quote.destinationToken.amount.decimals, outputToken: serializeToken(quote.destinationToken.token),
      sourceBaseUnits: String(amount.units(quote.sourceToken.amount)), sourceDecimals: quote.sourceToken.amount.decimals,
      destinationNativeGas: quote.destinationNativeGas ? { amountBaseUnits: String(amount.units(quote.destinationNativeGas)), decimals: quote.destinationNativeGas.decimals } : null,
      relayFee: quote.relayFee ? { token: serializeToken(quote.relayFee.token), amountBaseUnits: String(amount.units(quote.relayFee.amount)), decimals: quote.relayFee.amount.decimals } : null,
      eta: quote.eta, expires: quote.expires, warnings: quote.warnings, details: quote.details });
  }
  return { quotes, sdk: '6.1.5', sourceGasEstimated: false, destinationRedeemGasEstimated: false };
}
try { process.stdout.write(json({ ok: true, result: await run() })); process.exit(0); }
catch(error) { process.stdout.write(json({ ok: false, error: { code: 'SDK_ERROR', message: String(error.message ?? error) } })); process.exit(1); }
