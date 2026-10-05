import { baseSepolia, arbitrumSepolia } from 'viem/chains'
import type { AssetId } from './types'

export const supportedChains = [baseSepolia, arbitrumSepolia] as const
export function nativeAsset(chainId: number): AssetId {
  const chain = supportedChains.find(chain => chain.id === chainId)
  if (!chain) throw new Error('Unsupported request chain')
  return { chain: { ecosystem: 'evm', chainId }, kind: 'native', symbol: chain.nativeCurrency.symbol, decimals: chain.nativeCurrency.decimals }
}
export function chainName(chainId: number) {
  return supportedChains.find(chain => chain.id === chainId)?.name ?? `Chain ${chainId}`
}
export function assetIdentity(asset: AssetId): string {
  if (asset.kind === 'substrate') return `${asset.chain.name} / ${asset.assetIdentifier}`
  return `${chainName(asset.chain.chainId)} / ${asset.kind === 'native' ? 'native gas token' : asset.address}`
}
