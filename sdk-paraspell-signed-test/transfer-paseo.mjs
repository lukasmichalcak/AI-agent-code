import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Builder, getBalance } from '@paraspell/sdk';
import { mnemonicToEntropy, entropyToMiniSecret, ss58Address, ss58Decode, validateMnemonic } from '@polkadot-labs/hdkd-helpers';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { getTxCreator } from 'polkadot-api/tx-creator';

// This example teleports 1 test PAS to the same account on PeoplePaseo.
// The source is AssetHubPaseo. There is no mainnet option in this file.
const amount = 10_000_000_000n;
const [mode, address] = process.argv.slice(2);
if (!['prepare', 'send'].includes(mode) || !address) {
  console.error('Usage: node transfer-paseo.mjs prepare|send YOUR_SS58_ADDRESS');
  process.exit(2);
}
try {
  const [key] = ss58Decode(address);
  if (key.length !== 32) throw new Error('Expected a 32-byte account ID');
} catch {
  console.error('Enter a valid Substrate SS58 address (the same account on both chains).');
  process.exit(2);
}

const checkedAt = new Date().toISOString();
const record = { checkedAt, sdk: '@paraspell/sdk@14.4.0', origin: 'AssetHubPaseo',
  destination: 'PeoplePaseo', token: 'PAS', amountBaseUnits: String(amount),
  sender: address, recipient: address, mode };
const safe = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v));
const save = async () => writeFile('paseo-transfer-result.json', JSON.stringify(safe(record), null, 2) + '\n');
const builder = () => Builder().from('AssetHubPaseo').to('PeoplePaseo')
  .currency({ symbol: 'PAS', amount }).sender(address).recipient(address);
const balance = chain => getBalance({ chain, address });
const format = base => `${(Number(base) / 1e10).toFixed(6)} PAS`;
async function check(label, fn) {
  console.log(`Checking ${label}...`);
  const timer = AbortSignal.timeout(60_000);
  // Read-only RPC calls can stall when endpoints are unreachable. Exit on timeout.
  return Promise.race([fn(), new Promise((_, reject) =>
    timer.addEventListener('abort', () => reject(new Error(`${label} timed out after 60 seconds`)), { once: true }))]);
}

try {
  // Derive the signer only in send mode and require it to match the funded account.
  let creator;
  if (mode === 'send') {
    const mnemonic = process.env.PASEO_TEST_MNEMONIC?.trim();
    delete process.env.PASEO_TEST_MNEMONIC;
    if (!mnemonic || !validateMnemonic(mnemonic)) throw new Error('Set PASEO_TEST_MNEMONIC to a valid dedicated testnet Sr25519 mnemonic.');
    const pair = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(mnemonic)))('');
    const derived = ss58Address(pair.publicKey);
    if (Buffer.compare(Buffer.from(ss58Decode(derived)[0]), Buffer.from(ss58Decode(address)[0])) !== 0)
      throw new Error(`Mnemonic derives ${derived}, which differs from ${address}; nothing was sent.`);
    creator = getTxCreator(pair.publicKey, 'Sr25519', pair.sign);
  }

  // Live balances, estimated fees, and cross-chain simulation precede submission.
  record.sourceBefore = await check('source balance', () => balance('AssetHubPaseo'));
  record.destinationBefore = await check('destination balance', () => balance('PeoplePaseo'));
  record.fee = safe(await check('XCM fees', () => builder().getXcmFee()));
  record.transferInfo = safe(await check('transfer info', () => builder().getTransferInfo()));
  record.dryRun = safe(await check('dry run', () => builder().dryRun()));
  record.destinationEdCheck = await check('destination existential deposit', () => builder().verifyEdOnDestination());
  const tx = await check('unsigned build', () => builder().build());
  record.encodedCallHex = `0x${Buffer.from(await tx.getEncodedData()).toString('hex')}`;
  await save();

  console.log(`Source balance: ${format(record.sourceBefore)}; destination: ${format(record.destinationBefore)}`);
  console.log('Estimated fee:', JSON.stringify(record.fee));
  console.log('Dry run:', JSON.stringify(record.dryRun));
  console.log('Destination ED check:', record.destinationEdCheck);
  const info = record.transferInfo;
  if (!record.fee?.success || !record.dryRun?.success || !record.dryRun?.origin?.success ||
      record.dryRun?.destination?.success === false || !record.destinationEdCheck ||
      info?.origin?.selectedCurrency?.sufficient === false || info?.origin?.xcmFee?.sufficient === false ||
      info?.destination?.receivedCurrency?.sufficient === false ||
      BigInt(record.sourceBefore) < amount + BigInt(record.fee?.origin?.fee ?? 0) +
        BigInt(record.fee?.origin?.asset?.existentialDeposit ?? 0)) {
    throw new Error('A preflight check failed. Inspect paseo-transfer-result.json; do not submit.');
  }
  if (mode === 'prepare') {
    record.status = 'PREPARED_ONLY';
    await save();
    console.log('Preparation succeeded. No transaction was signed or submitted.');
  } else {
    const rl = createInterface({ input: stdin, output: stdout });
    let answer;
    try { answer = await rl.question(`Send 1 test PAS from AssetHubPaseo to PeoplePaseo for ${address}? Type SEND: `); }
    finally { rl.close(); }
    if (answer !== 'SEND') throw new Error('Cancelled; no transaction submitted.');
    record.status = 'SUBMISSION_STARTED';
    record.submissionStartedAt = new Date().toISOString();
    await save();
    // PAPI v3 signs, broadcasts and waits for source-chain finalization.
    const finalized = await tx.createAndSubmit(creator);
    record.finalized = safe(finalized);
    record.status = finalized.ok ? 'SOURCE_FINALIZED' : 'SOURCE_EXTRINSIC_FAILED';
    await save();
    console.log('Source finalization:', JSON.stringify(record.finalized));
    if (!finalized.ok) throw new Error('The source extrinsic finalized with failure.');

    // XCM execution on the destination is asynchronous; verify by its balance.
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10_000));
      try {
        record.destinationAfter = await balance('PeoplePaseo');
        if (BigInt(record.destinationAfter) > BigInt(record.destinationBefore)) {
          record.status = 'DESTINATION_BALANCE_INCREASED';
          break;
        }
      } catch (error) { record.lastDestinationQueryError = String(error); }
    }
    try { record.sourceAfter = await balance('AssetHubPaseo'); }
    catch (error) { record.sourceAfterError = String(error); }
    if (record.status !== 'DESTINATION_BALANCE_INCREASED') record.status = 'DESTINATION_NOT_YET_OBSERVED';
    await save();
    console.log(`Result: ${record.status}. Transaction hash: ${finalized.txHash}`);
    console.log('Review paseo-transfer-result.json for source and destination evidence.');
  }
} catch (error) {
  record.error = String(error);
  if (!record.status) record.status = 'NOT_SUBMITTED';
  await save();
  console.error(`${record.status}: ${error}`);
  process.exitCode = 1;
} finally {
  // The SDK's pooled RPC connections can keep Node alive after completion.
  setTimeout(() => process.exit(process.exitCode ?? 0), 1000).unref();
}
