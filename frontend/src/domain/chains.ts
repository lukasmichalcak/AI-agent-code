import { baseSepolia, arbitrumSepolia, sepolia, mainnet, arbitrum, base } from 'viem/chains'
import type { AssetId } from './types'

export const supportedChains = [baseSepolia, arbitrumSepolia] as const
export const requestChains = [...supportedChains, sepolia, mainnet, arbitrum, base,
  { id: 'AssetHubPaseo', name: 'AssetHub Paseo', nativeCurrency: { symbol: 'PAS', decimals: 10 } },
  { id: 'PeoplePaseo', name: 'People Paseo', nativeCurrency: { symbol: 'PAS', decimals: 10 } },
] as const
export function nativeAsset(chainId: number | string): AssetId {
  const chain = requestChains.find(chain => chain.id === chainId)
  if (!chain) throw new Error('Unsupported request chain')
  if (typeof chainId === 'string') return { chain: { ecosystem: 'substrate', name: chainId }, kind: 'substrate', assetIdentifier: 'native:PAS', symbol: 'PAS', decimals: 10 }
  return { chain: { ecosystem: 'evm', chainId }, kind: 'native', symbol: chain.nativeCurrency.symbol, decimals: chain.nativeCurrency.decimals }
}
export function chainName(chainId: number) {
  return requestChains.find(chain => chain.id === chainId)?.name ?? `Chain ${chainId}`
}
export function assetIdentity(asset: AssetId): string {
  if (asset.kind === 'substrate') return `${asset.chain.name} / ${asset.assetIdentifier}`
  return `${chainName(asset.chain.chainId)} / ${asset.kind === 'native' ? 'native gas token' : asset.address}`
}
