import { describe, expect, it } from 'vitest'
import { createIntent, initialFields, validateRequest } from './request'

const recipient = '0x1111111111111111111111111111111111111111'
const valid = { ...initialFields, amount: '0.000000000000000001', recipient }
describe('transfer request validation', () => {
  it('accepts precise token amounts without converting to floating point', () => {
    expect(validateRequest(valid)).toEqual({})
    expect(createIntent(valid).amount).toBe('0.000000000000000001')
  })
  it.each(['0', '-1', '1e3', 'NaN', '0.0000000000000000001'])('rejects invalid amount %s', amount => {
    expect(validateRequest({ ...valid, amount }).amount).toBeDefined()
  })
  it('rejects same-chain requests and invalid or zero recipients', () => {
    expect(validateRequest({ ...valid, destinationChain: valid.sourceChain }).destinationChain).toBeDefined()
    for (const address of ['0x123', '0x0000000000000000000000000000000000000000']) expect(validateRequest({ ...valid, recipient: address }).recipient).toBeDefined()
  })
  it('requires ERC-20 identity and enforces token precision', () => {
    const fields = { ...valid, sourceKind: 'erc20' as const, sourceDecimals: '6', sourceSymbol: 'USDC', sourceAddress: recipient, amount: '2.000001' }
    expect(validateRequest(fields)).toEqual({})
    expect(createIntent(fields).sourceAsset).toMatchObject({ kind: 'erc20', address: recipient, chain: { ecosystem: 'evm', chainId: 84532 } })
    expect(validateRequest({ ...fields, amount: '2.0000001' }).amount).toBeDefined()
    expect(validateRequest({ ...fields, sourceAddress: '' }).sourceAddress).toBeDefined()
    expect(validateRequest({ ...fields, sourceDecimals: '256' }).sourceDecimals).toBeDefined()
  })
  it('checks constraints and preserves natural-language text without parsing it', () => {
    const fields = { ...valid, naturalLanguage: 'Send 900 USDC', maximumFeeUsd: '0', minimumReceived: '0', allowWrapped: true }
    const intent = createIntent(fields)
    expect(intent.naturalLanguage).toBe('Send 900 USDC')
    expect(intent.amount).toBe(valid.amount)
    expect(intent.constraints).toEqual({ maximumFeeUsd: '0', minimumReceived: '0', allowWrapped: true })
    expect(validateRequest({ ...valid, maximumFeeUsd: '-1' }).maximumFeeUsd).toBeDefined()
    expect(validateRequest({ ...valid, minimumReceived: '-1' }).minimumReceived).toBeDefined()
    expect(() => createIntent(initialFields)).toThrow()
  })
})
