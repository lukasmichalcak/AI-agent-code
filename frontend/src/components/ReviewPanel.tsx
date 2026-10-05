import { assetIdentity } from '../domain/chains'
import type { TransferIntent } from '../domain/types'

export function ReviewPanel({ intent }: { intent: TransferIntent | null }) {
  return <section className="panel" aria-labelledby="review-title"><div className="section-heading"><span className="step-number">03</span><div><h2 id="review-title">Review your request</h2><p>Your manually entered details, before any planning or approval.</p></div></div>
    {!intent ? <div className="empty-state compact"><span className="empty-icon" aria-hidden="true">↗</span><p>Complete the details and select <strong>Review request</strong> to see your exact request here.</p></div> : <div role="status">
      <div className="review-highlight"><strong>{intent.amount} {intent.sourceAsset.symbol}</strong><span>requested for transfer</span></div>
      <dl className="review-list"><dt>Source asset</dt><dd>{assetIdentity(intent.sourceAsset)} · {intent.sourceAsset.symbol} · {intent.sourceAsset.decimals} decimals</dd><dt>Destination preference</dt><dd>{assetIdentity(intent.destinationAsset)} · {intent.destinationAsset.symbol} · {intent.destinationAsset.decimals} decimals</dd><dt>Recipient</dt><dd className="address">{intent.recipient}</dd><dt>Maximum total fee</dt><dd>{intent.constraints.maximumFeeUsd !== undefined ? `$${intent.constraints.maximumFeeUsd} USD` : 'No limit entered'}</dd><dt>Minimum received</dt><dd>{intent.constraints.minimumReceived !== undefined ? `${intent.constraints.minimumReceived} ${intent.destinationAsset.symbol}` : 'No minimum entered'}</dd><dt>Wrapped alternative</dt><dd>{intent.constraints.allowWrapped ? 'Acceptable if a future plan satisfies the other constraints' : 'Not acceptable'}</dd><dt>Original task text</dt><dd className="task-copy">{intent.naturalLanguage || 'No task text entered'}</dd></dl>
      <p className="info">Request reviewed. No quote has been obtained and no transaction is approved. Editing any field clears this review.</p>
    </div>}
  </section>
}
