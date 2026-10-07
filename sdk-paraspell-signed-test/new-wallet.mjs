import { generateMnemonic, mnemonicToEntropy, entropyToMiniSecret, ss58Address } from '@polkadot-labs/hdkd-helpers';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';

// Generate a fresh dedicated Sr25519 testnet account locally. No file is written.
const mnemonic = generateMnemonic();
const pair = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(mnemonic)))('');
console.log(`Address: ${ss58Address(pair.publicKey)}`);
console.log(`Mnemonic (copy privately for this disposable testnet account): ${mnemonic}`);
