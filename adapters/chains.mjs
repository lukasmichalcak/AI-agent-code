import { arbitrum, base, mainnet, sepolia, baseSepolia, arbitrumSepolia } from 'viem/chains';
export const CHAINS = new Map([
  [1, { viem: mainnet, name: 'Ethereum', network: 'Mainnet' }],
  [42161, { viem: arbitrum, name: 'Arbitrum', network: 'Mainnet' }],
  [8453, { viem: base, name: 'Base', network: 'Mainnet' }],
  [11155111, { viem: sepolia, name: 'Sepolia', network: 'Testnet' }],
  [84532, { viem: baseSepolia, name: 'BaseSepolia', network: 'Testnet' }],
  [421614, { viem: arbitrumSepolia, name: 'ArbitrumSepolia', network: 'Testnet' }],
]);
export const SUBSTRATE_CHAINS = ['AssetHubPaseo', 'PeoplePaseo'];
export function evmChain(id) {
  const chain = CHAINS.get(id);
  if (!chain) throw new Error('Unsupported EVM chain in bounded adapter');
  return chain;
}
export function validateRequest(request) {
  if (!['discover', 'balance', 'quote'].includes(request.operation)) throw new Error('Read-only operation required');
  if (!['paraspell', 'wormhole', 'evm'].includes(request.provider)) throw new Error('Unsupported provider');
  const a = request.intent?.sourceAsset ?? request.asset;
  const b = request.intent?.destinationAsset;
  if (request.provider === 'paraspell') {
    for (const asset of [a, b].filter(Boolean)) {
      if (asset.chain.genesisHash) throw new Error('Custom genesis hashes are not supported in the SDK-name-based V0 adapter');
      if (asset.chain.ecosystem !== 'substrate' || !SUBSTRATE_CHAINS.includes(asset.chain.name) || asset.kind !== 'substrate' || asset.assetIdentifier !== 'native:PAS' || asset.decimals !== 10) throw new Error('ParaSpell V0 supports only native:PAS / 10 decimals on the two Paseo chains');
    }
  } else {
    for (const asset of [a, b].filter(Boolean)) {
      evmChain(asset.chain.chainId);
      if (asset.chain.ecosystem !== 'evm' || !['native', 'erc20'].includes(asset.kind)) throw new Error('EVM asset required');
      if (asset.kind === 'native' && asset.decimals !== 18) throw new Error('Native decimals mismatch');
      if (asset.kind === 'erc20' && !/^0x[0-9a-fA-F]{40}$/.test(asset.address)) throw new Error('Token contract required');
    }
    if (a && b && evmChain(a.chain.chainId).network !== evmChain(b.chain.chainId).network) throw new Error('Cannot bridge mainnet to testnet');
  }
  if (request.operation !== 'discover') {
    const address = request.sender ?? request.address;
    if (request.provider === 'paraspell') {
      if (!/^[1-9A-HJ-NP-Za-km-z]{47,50}$/.test(address ?? '')) throw new Error('SS58 account required');
    } else if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? '') || BigInt(address) === 0n) throw new Error('Nonzero EVM account required');
  }
  if (request.operation === 'quote') {
    if (!/^\d+$/.test(request.amountBaseUnits ?? '') || BigInt(request.amountBaseUnits) <= 0n) throw new Error('Positive base-unit amount required');
  }
}
