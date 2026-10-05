export type ChainRef =
  | { ecosystem: 'evm'; chainId: number }
  | { ecosystem: 'substrate'; genesisHash: string; name: string }

// Symbols are display metadata; chain + identifier establishes identity.
export type AssetId =
  | { chain: Extract<ChainRef, { ecosystem: 'evm' }>; kind: 'native'; symbol: string; decimals: number }
  | { chain: Extract<ChainRef, { ecosystem: 'evm' }>; kind: 'erc20'; address: `0x${string}`; symbol: string; decimals: number }
  | { chain: Extract<ChainRef, { ecosystem: 'substrate' }>; kind: 'substrate'; assetIdentifier: string; symbol: string; decimals: number }

export type WalletSession =
  | { ecosystem: 'evm'; address?: `0x${string}`; chainId?: number; connector?: string; status: 'disconnected' | 'connecting' | 'reconnecting' | 'connected' }
  | { ecosystem: 'substrate'; address?: string; genesisHash?: string; signerAdapter?: string; status: 'disconnected' | 'connecting' | 'connected' }

export interface AssetAmount { asset: AssetId; amount: string } // Decimal token units, never JS floating point.
export interface TransferIntent {
  id: string
  naturalLanguage: string
  sourceAsset: AssetId
  destinationAsset: AssetId
  amount: string
  recipient: string
  constraints: { maximumFeeUsd?: string; minimumReceived?: string; allowWrapped: boolean }
}
export interface FeeItem {
  label: string
  amount: AssetAmount
  includedInInput: boolean
  estimatedUsd?: string
}
export interface RouteCandidate {
  id: string
  intentId: string
  provider: 'paraspell' | 'lifi' | 'wormhole'
  providerQuoteId?: string
  sourceAsset: AssetId
  sourceInput: AssetAmount
  destinationAsset: AssetId
  destinationRepresentation: 'native' | 'wrapped' | 'canonical'
  expectedOutput: AssetAmount
  fees: FeeItem[]
  gasNeeds: AssetAmount[]
  totalUserCostUsd?: string
  quotedAt: string
  expiresAt?: string
  warnings: string[]
  steps: { id: string; description: string; chain: ChainRef; action: 'approval' | 'swap' | 'bridge' | 'redeem' | 'transfer' }[]
}
export type TransferStatus = 'awaiting-approval' | 'source-submitted' | 'in-progress' | 'destination-completed' | 'failed'
export interface TransferExecution {
  candidateId: string
  status: TransferStatus
  transactions: { chain: ChainRef; hash: string; phase: 'source' | 'destination' }[]
  updatedAt: string
  error?: string
}
