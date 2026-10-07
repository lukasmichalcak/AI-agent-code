import { writeFile } from 'node:fs/promises';
import { Builder, getBalance, getSupportedAssets, getSupportedDestinations } from '@paraspell/sdk';

// Fixed test case: a public funded Paseo account sends 1 PAS to itself across chains.
// Alice's address supplies account context for estimates; there is no signer or private key.
const alice = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const amount = 10_000_000_000n; // 1 PAS, 10 decimal places

// Store the exact inputs and every response so this run can be reviewed later.
const evidence = {
  checkedAt: new Date().toISOString(), sdk: '@paraspell/sdk@14.4.0',
  origin: 'AssetHubPaseo', destination: 'PeoplePaseo', token: 'PAS',
  amountBaseUnits: String(amount), address: alice, steps: {}
};
// JSON has no bigint type. Keep base-unit integers exact by saving them as strings.
const clean = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v));
let failures = 0;

// Run each independent check with a timeout; record failures without hiding later checks.
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

// Recreate the same transfer request for each query, avoiding state reused by the SDK.
const builder = () => Builder().from('AssetHubPaseo').to('PeoplePaseo')
  .currency({ symbol: 'PAS', amount }).recipient(alice).sender(alice);

// Query the SDK's route/asset registry. This is candidate support, not an execution.
await step('1/6 Assets and destinations: getSupportedAssets, getSupportedDestinations', 'assetsAndDestinations', () => ({
  supportedAssets: getSupportedAssets('AssetHubPaseo', 'PeoplePaseo')
    .map(a => ({ symbol: a.symbol, decimals: a.decimals, assetId: a.assetId })),
  pasDestinations: getSupportedDestinations('AssetHubPaseo', { symbol: 'PAS' })
}));
// Query live chain state for the native asset; currency is omitted intentionally.
await step('2/6 Balance: getBalance on public Alice address', 'balanceBaseUnits',
  () => getBalance({ chain: 'AssetHubPaseo', address: alice }));
// Estimate costs on the origin, destination and any intermediate hops.
await step('3/6 Fees: builder.getXcmFee', 'fee', () => builder().getXcmFee());

// Construct the unsigned call and save its encoded bytes as auditable evidence.
// Do not invoke submission methods exposed on the returned transaction object.
await step('4/6 Send preparation: builder.build (unsigned transaction)', 'unsignedBuild', async () => {
  const tx = await builder().build();
  const encodedCall = await tx.getEncodedData();
  return { built: true, encodedCallHex: `0x${Buffer.from(encodedCall).toString('hex')}`,
    availableMethods: Object.keys(tx).filter(k => typeof tx[k] === 'function') };
});

// Ask the chains to simulate the proposed transfer; this does not submit it.
await step('5/6 Simulation: builder.dryRun', 'dryRun', async () => {
  const r = await builder().dryRun();
  return { success: r.success, originSuccess: r.origin?.success,
    destinationSuccess: r.destination?.success, ...(!r.success ? { details: r } : {}) };
});
// Query estimated balance changes and destination receipt, including fee details.
await step('6/6 Expected destination receipt: builder.getTransferInfo', 'transferInfo', async () => {
  const r = await builder().getTransferInfo();
  return { fields: Object.keys(r), receivedAmountBaseUnits: r.destination?.receivedCurrency?.receivedAmount,
    origin: r.origin, hops: r.hops, destination: r.destination };
});

// Save a timestamped JSON record, including any errors, in the current folder.
await writeFile('paraspell-result.json', JSON.stringify(evidence, null, 2) + '\n');
console.log('\nSaved paraspell-result.json. This simulated a send; no transaction was signed or broadcast.');
process.exit(failures ? 1 : 0); // RPC clients may retain open sockets.
