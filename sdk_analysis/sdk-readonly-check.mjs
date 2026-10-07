// Run in a directory with the exact SDK versions installed (see README below).
// This script reads public data and simulates one ParaSpell transfer. It never signs.
import { createClient, getChains, getConnections, getQuote } from '@lifi/sdk';
import { getSupportedAssets, getSupportedDestinations, getBalance, Builder } from '@paraspell/sdk';
import { wormhole } from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import * as routes from '@wormhole-foundation/sdk-connect/routes';

const alice = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const dead = '0x000000000000000000000000000000000000dEaD';
const out = { checkedAt: new Date().toISOString(), versions: {
  lifi: '4.10.0', paraspell: '14.4.0', wormhole: '6.1.5' } };
const json = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v));
async function check(name, fn) {
  try { out[name] = json(await Promise.race([fn(), new Promise((_, fail) => setTimeout(() => fail(new Error('timeout after 30 s')), 30000))])); }
  catch (error) { out[name] = { error: String(error), cause: String(error?.cause ?? '') }; }
}

await check('paraspellAssets', () => {
  const assets = getSupportedAssets('AssetHubPaseo', 'PeoplePaseo');
  return { pair: 'AssetHubPaseo -> PeoplePaseo', assets: assets.map(a => ({symbol:a.symbol,decimals:a.decimals})),
    pasDestinations: getSupportedDestinations('AssetHubPaseo', {symbol:'PAS'}) };
});
await check('paraspellBalance', () => getBalance({chain:'AssetHubPaseo',address:alice}));
const builder = () => Builder().from('AssetHubPaseo').to('PeoplePaseo')
  .currency({symbol:'PAS',amount:10000000000n}).recipient(alice).sender(alice);
await check('paraspellFee', () => builder().getXcmFee());
await check('paraspellDryRun', async () => {
  const result = await builder().dryRun();
  return { success:result.success, origin:result.origin?.success, destination:result.destination?.success,
    error:result.success ? undefined : result };
});
await check('paraspellTransferInfo', async () => {
  const info = await builder().getTransferInfo();
  return { fields:Object.keys(info), receivedAmount:info.destination?.receivedCurrency?.receivedAmount };
});

const lifi = createClient({ integrator:'thesis-sdk-audit', apiUrl:'https://li.quest/v1' });
await check('lifiTestnets', async () => (await getChains(lifi))
  .filter(c => [11155111,11155420,421614,84532,5042002].includes(c.id))
  .map(c => ({id:c.id,name:c.name})));
await check('lifiTestnetConnections', async () => ({
  pair:'Arc Testnet -> OP Sepolia',
  count:(await getConnections(lifi,{fromChain:5042002,toChain:11155420})).connections.length }));
await check('lifiQuote', async () => {
  const q=await getQuote(lifi,{fromChain:42161,toChain:8453,
    fromToken:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    toToken:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    fromAmount:'1000000',fromAddress:dead});
  return {fromAmount:q.estimate.fromAmount,toAmount:q.estimate.toAmount,
    feeCosts:q.estimate.feeCosts?.map(f => ({name:f.name,token:f.token?.symbol,amount:f.amount,included:f.included})),
    gasCosts:q.estimate.gasCosts?.map(g => ({token:g.token?.symbol,amount:g.amount,amountUSD:g.amountUSD})),
    transactionRequestPresent:!!q.transactionRequest};
});

await check('wormhole', async () => {
  const wh=await wormhole('Testnet',[evm]);
  const resolver=wh.resolver([routes.TokenBridgeRoute]);
  return {network:wh.network,
    getBalance:typeof wh.getBalance,
    supportedDestinationTokens:typeof resolver.supportedDestinationTokens,
    supportedSourceTokens:typeof resolver.supportedSourceTokens,
    sortRoutes:typeof resolver.sortRoutes,
    nativeSepoliaBalance:await wh.getBalance('Sepolia','native',dead)};
});
console.log(JSON.stringify(out,null,2));
process.exit(0); // SDK RPC clients can otherwise keep the Node event loop open.
