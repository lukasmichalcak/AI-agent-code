import { isAddress, zeroAddress } from 'viem'
import { nativeAsset, supportedChains } from './chains'
import type { AssetId, TransferIntent } from './types'

export interface RequestFields {
  naturalLanguage: string
  sourceChain: string
  destinationChain: string
  sourceKind: 'native' | 'erc20'
  sourceAddress: string
  sourceSymbol: string
  sourceDecimals: string
  destinationKind: 'native' | 'erc20'
  destinationAddress: string
  destinationSymbol: string
  destinationDecimals: string
  amount: string
  recipient: string
  maximumFeeUsd: string
  minimumReceived: string
  allowWrapped: boolean
}
export type RequestErrors = Partial<Record<keyof RequestFields, string>>
export const initialFields: RequestFields = {
  naturalLanguage: '', sourceChain: String(supportedChains[0].id), destinationChain: String(supportedChains[1].id),
  sourceKind: 'native', sourceAddress: '', sourceSymbol: '', sourceDecimals: '18',
  destinationKind: 'native', destinationAddress: '', destinationSymbol: '', destinationDecimals: '18',
  amount: '', recipient: '', maximumFeeUsd: '', minimumReceived: '', allowWrapped: false,
}
function decimal(value: string, precision: number, positive: boolean): boolean {
  if (!/^\d+(\.\d+)?$/.test(value)) return false
  const fraction = value.split('.')[1] ?? ''
  return fraction.length <= precision && (!positive || /[1-9]/.test(value))
}
export function validateRequest(fields: RequestFields): RequestErrors {
  const errors: RequestErrors = {}
  for (const side of ['source', 'destination'] as const) {
    if (!supportedChains.some(chain => String(chain.id) === fields[`${side}Chain`])) errors[`${side}Chain`] = 'Select a supported testnet.'
    if (fields[`${side}Kind`] === 'erc20') {
      const address = fields[`${side}Address`].trim()
      if (!isAddress(address) || address.toLowerCase() === zeroAddress) errors[`${side}Address`] = 'Enter a valid, nonzero token contract address.'
      if (!fields[`${side}Symbol`].trim()) errors[`${side}Symbol`] = 'Enter a display symbol.'
      const decimals = fields[`${side}Decimals`]
      if (!/^\d+$/.test(decimals) || Number(decimals) > 255) errors[`${side}Decimals`] = 'Decimals must be an integer from 0 to 255.'
    }
  }
  if (fields.sourceChain === fields.destinationChain) errors.destinationChain = 'Choose a different destination for this cross-chain request.'
  const sourcePrecision = fields.sourceKind === 'native' ? 18 : Number(fields.sourceDecimals)
  const destinationPrecision = fields.destinationKind === 'native' ? 18 : Number(fields.destinationDecimals)
  if (!decimal(fields.amount.trim(), sourcePrecision, true)) errors.amount = `Enter an amount greater than zero with at most ${sourcePrecision} decimal places.`
  const recipient = fields.recipient.trim()
  if (!isAddress(recipient) || recipient.toLowerCase() === zeroAddress) errors.recipient = 'Enter a valid, nonzero EVM recipient address (0x…).'
  if (fields.maximumFeeUsd.trim() && !decimal(fields.maximumFeeUsd.trim(), 2, false)) errors.maximumFeeUsd = 'Enter a nonnegative USD amount with at most 2 decimal places.'
  if (fields.minimumReceived.trim() && !decimal(fields.minimumReceived.trim(), destinationPrecision, false)) errors.minimumReceived = `Enter a nonnegative output amount with at most ${destinationPrecision} decimal places.`
  return errors
}
export function createIntent(fields: RequestFields): TransferIntent {
  if (Object.keys(validateRequest(fields)).length) throw new Error('Request must be valid before review.')
  function asset(side: 'source' | 'destination'): AssetId {
    const chainId = Number(fields[`${side}Chain`])
    if (fields[`${side}Kind`] === 'native') return nativeAsset(chainId)
    return { chain: { ecosystem: 'evm', chainId }, kind: 'erc20', address: fields[`${side}Address`].trim() as `0x${string}`, symbol: fields[`${side}Symbol`].trim(), decimals: Number(fields[`${side}Decimals`]) }
  }
  return {
    id: crypto.randomUUID(), naturalLanguage: fields.naturalLanguage,
    sourceAsset: asset('source'), destinationAsset: asset('destination'), amount: fields.amount.trim(), recipient: fields.recipient.trim(),
    constraints: { maximumFeeUsd: fields.maximumFeeUsd.trim() || undefined, minimumReceived: fields.minimumReceived.trim() || undefined, allowWrapped: fields.allowWrapped },
  }
}
