import { useState, type FormEvent, type ReactNode } from 'react'
import { supportedChains } from '../domain/chains'
import { createIntent, initialFields, validateRequest, type RequestFields, type RequestErrors } from '../domain/request'
import type { TransferIntent } from '../domain/types'

export function RequestForm({ onReview, onEdit, connectedAddress }: { onReview: (intent: TransferIntent) => void; onEdit: () => void; connectedAddress?: string }) {
  const [fields, setFields] = useState(initialFields)
  const [errors, setErrors] = useState<RequestErrors>({})
  function update<K extends keyof RequestFields>(key: K, value: RequestFields[K]) {
    setFields(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
    onEdit()
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validateRequest(fields)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus()
      return
    }
    onReview(createIntent(fields))
  }
  function field(key: keyof RequestFields, label: string, control: ReactNode, help?: string) {
    return <div className="field" key={key}><label htmlFor={key}>{label}</label>{control}{help && <small id={`${key}-help`}>{help}</small>}{errors[key] && <span id={`${key}-error`} className="error">{errors[key]}</span>}</div>
  }
  function input(key: keyof RequestFields, placeholder: string, numeric = false) {
    return <input id={key} value={String(fields[key])} placeholder={placeholder} inputMode={numeric ? 'decimal' : 'text'} onChange={event => update(key, event.target.value as RequestFields[typeof key])} aria-invalid={!!errors[key]} aria-describedby={`${key}-help ${key}-error`} />
  }
  function assets(side: 'source' | 'destination') {
    const kindKey = `${side}Kind` as const
    return <>
      {field(kindKey, side === 'source' ? 'Source asset' : 'Destination asset', <select id={kindKey} value={fields[kindKey]} onChange={event => update(kindKey, event.target.value as 'native' | 'erc20')}><option value="native">ETH · native gas token</option><option value="erc20">Custom ERC-20 token</option></select>)}
      {fields[kindKey] === 'erc20' && <div className="custom-asset">
        {field(`${side}Address`, 'Token contract address', input(`${side}Address`, '0x…'), 'Use the contract on the selected chain. Token metadata is manually supplied and will need on-chain verification before quoting.')}
        <div className="two-columns">{field(`${side}Symbol`, 'Display symbol', input(`${side}Symbol`, 'e.g. USDC'))}{field(`${side}Decimals`, 'Token decimals', input(`${side}Decimals`, 'e.g. 6', true))}</div>
      </div>}
    </>
  }
  function chain(side: 'source' | 'destination') {
    const key = `${side}Chain` as const
    return field(key, side === 'source' ? 'Source chain' : 'Destination chain', <select id={key} value={fields[key]} onChange={event => update(key, event.target.value)} aria-invalid={!!errors[key]} aria-describedby={`${key}-error`}>{supportedChains.map(chain => <option value={chain.id} key={chain.id}>{chain.name}</option>)}</select>)
  }
  return <form onSubmit={submit} noValidate>
    <section className="panel task-panel"><div className="section-heading"><span className="step-number">01</span><div><h2>What would you like to do?</h2><p>Describe your goal, then enter the exact details below.</p></div></div>
      <label htmlFor="naturalLanguage" className="sr-only">Natural-language task</label>
      <textarea id="naturalLanguage" rows={3} value={fields.naturalLanguage} onChange={event => update('naturalLanguage', event.target.value)} placeholder="For example: Send 2 USDC from Base to Arbitrum and keep the total cost below $1." aria-describedby="task-help" />
      <small id="task-help">Saved with your request for the future agent. Text is not parsed in this milestone; the fields below are entered manually. This demo uses testnets.</small>
    </section>
    <section className="panel"><div className="section-heading"><span className="step-number">02</span><div><h2>Transfer details</h2><p>Choose where your assets start and where they should arrive.</p></div></div>
      <div className="transfer-columns"><div className="asset-column"><h3>From</h3>{chain('source')}{assets('source')}{field('amount', 'Amount to send', input('amount', '0.00', true), 'Amount in source token units; fees are not yet known.')}</div><div className="asset-column"><h3>To</h3>{chain('destination')}{assets('destination')}{field('recipient', 'Recipient address', input('recipient', '0x…'), 'The EVM address that receives the destination asset.')}{connectedAddress && <button type="button" className="text-button" onClick={() => update('recipient', connectedAddress)}>Use connected address</button>}</div></div>
      <div className="constraints"><h3>Your constraints</h3><p className="muted">These are limits you request, not estimates or guarantees.</p><div className="two-columns">{field('maximumFeeUsd', 'Maximum total fee (USD, optional)', input('maximumFeeUsd', 'e.g. 1.00', true), 'Future plans must compare all fees and gas using explicit USD valuations.')}{field('minimumReceived', 'Minimum received (optional)', input('minimumReceived', 'e.g. 1.95', true), 'In units of the chosen destination asset.')}</div>
        <label className="checkbox-label" htmlFor="allowWrapped"><input id="allowWrapped" type="checkbox" checked={fields.allowWrapped} onChange={event => update('allowWrapped', event.target.checked)} aria-describedby="wrapped-help" /><span>Allow a wrapped destination token</span></label><small id="wrapped-help">A wrapped token represents an asset through another contract. It can have different redemption steps and risks. The selected destination asset is your preference; future plans must identify any wrapped alternative precisely.</small>
      </div>
      <div className="form-footer"><span className="muted">Reviewing a request does not sign or send anything.</span><button type="submit">Review request <span aria-hidden="true">→</span></button></div>
    </section>
  </form>
}
