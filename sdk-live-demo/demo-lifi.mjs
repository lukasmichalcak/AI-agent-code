import { writeFile } from 'node:fs/promises';
import { createClient, getChains, getConnections, getQuote } from '@lifi/sdk';

// Read-only LI.FI client: an integrator label is required; there is no wallet provider.
const client = createClient({ integrator: 'thesis-sdk-live-demo', apiUrl: 'https://li.quest/v1' });
// Keep the package version, time and all individual observations in a JSON record.
const evidence = { checkedAt: new Date().toISOString(), sdk: '@lifi/sdk@4.10.0', steps: {} };
// Preserve bigint amounts as decimal strings when serializing SDK responses.
const clean = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v));
let failures = 0;

// Give each network request a timeout, record errors, and continue to the next check.
async function step(label, name, fn) {
  console.log(`\n${label}`);
  try {
    const result = clean(await Promise.race([
      fn(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout after 45 seconds')), 45000))
    ]));
    evidence.steps[name] = result;
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    failures++;
    evidence.steps[name] = { error: String(error), cause: String(error?.cause ?? '') };
    console.error(JSON.stringify(evidence.steps[name], null, 2));
  }
}

// List a fixed set of testnet IDs from the SDK response. This is not an exhaustive list.
await step('1/3 Five selected testnet chains: getChains', 'testnets', async () =>
  (await getChains(client)).filter(c => [11155111, 11155420, 421614, 84532, 5042002].includes(c.id))
    .map(c => ({ id: c.id, name: c.name })));

// Count candidate token connections for one testnet pair; zero is a meaningful result.
await step('2/3 Example testnet connectivity: getConnections (zero is a valid result)', 'testnetConnections', async () => ({
  fromChain: 5042002, toChain: 11155420,
  count: (await getConnections(client, { fromChain: 5042002, toChain: 11155420 })).connections.length
}));

// Request one quote for a known mainnet token pair; this only reads API data.
await step('3/3 Mainnet quote and fee breakdown: getQuote (1 USDC, Arbitrum to Base)', 'quote', async () => {
  // The public placeholder address satisfies quote inputs but cannot authorize a transfer.
  const q = await getQuote(client, {
    fromChain: 42161, toChain: 8453,
    fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    fromAmount: '1000000',
    fromAddress: '0x000000000000000000000000000000000000dEaD'
  });
  // Report gross input, expected/minimum output, included fees, separate gas and tx presence.
  return {
    tool: q.tool, fromAmount: q.estimate.fromAmount, toAmount: q.estimate.toAmount,
    toAmountMin: q.estimate.toAmountMin,
    feeCosts: q.estimate.feeCosts?.map(f => ({ name: f.name, token: f.token?.symbol,
      amount: f.amount, amountUSD: f.amountUSD, included: f.included })),
    gasCosts: q.estimate.gasCosts?.map(g => ({ token: g.token?.symbol,
      amount: g.amount, amountUSD: g.amountUSD })),
    unsignedTransactionRequestPresent: !!q.transactionRequest
  };
});

// Keep a timestamped local result for comparison with future quotes and live tests.
await writeFile('lifi-result.json', JSON.stringify(evidence, null, 2) + '\n');
console.log('\nSaved lifi-result.json. This requested a quote; no transaction was signed or broadcast.');
console.log('Balance methods need a matching wallet provider and selected token objects.');
process.exit(failures ? 1 : 0);
