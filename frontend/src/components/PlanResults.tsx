import { assetIdentity } from '../domain/chains'
import type { RouteCandidate } from '../domain/types'

function CandidateCard({ candidate }: { candidate: RouteCandidate }) {
  return (
    <article className="candidate">
      <div className="section-top">
        <h3>{candidate.provider}</h3>
        <span className="badge">Estimate</span>
      </div>
      <p>Input: <strong>{candidate.sourceInput.amount} {candidate.sourceInput.asset.symbol}</strong></p>
      <p>Expected output: <strong>{candidate.expectedOutput.amount} {candidate.expectedOutput.asset.symbol}</strong></p>
      <p>{assetIdentity(candidate.sourceAsset)} → {assetIdentity(candidate.destinationAsset)}</p>
      <p>Representation: {candidate.destinationRepresentation}</p>
      <p>Output identity: {assetIdentity(candidate.expectedOutput.asset)}</p>
      <p>Total user cost: {candidate.totalUserCostUsd !== undefined
        ? `$${candidate.totalUserCostUsd} USD (estimated)`
        : 'Not provided; cannot compare total cost yet'}</p>
      <h4>Fees</h4>
      {candidate.fees.length ? (
        <ul>{candidate.fees.map((fee, index) => (
          <li key={index}>
            {fee.label}: {fee.amount.amount} {fee.amount.asset.symbol} · {assetIdentity(fee.amount.asset)}
            {' · '}{fee.includedInInput ? 'included in input' : 'additional'}
            {fee.estimatedUsd !== undefined ? ` · estimated $${fee.estimatedUsd} USD` : ''}
          </li>
        ))}</ul>
      ) : <p>Fee breakdown not provided.</p>}
      <h4>Gas needed</h4>
      {candidate.gasNeeds.length ? (
        <ul>{candidate.gasNeeds.map((gas, index) => (
          <li key={index}>{gas.amount} {gas.asset.symbol} · {assetIdentity(gas.asset)}</li>
        ))}</ul>
      ) : <p>Gas requirements not provided.</p>}
      <p>Quoted: {candidate.quotedAt}</p>
      <p>Expiry: {candidate.expiresAt ?? 'Not provided; requires revalidation before approval'}</p>
      {candidate.warnings.map((warning, index) => <p className="error" key={index}>{warning}</p>)}
      <ol>{candidate.steps.map(step => (
        <li key={step.id}>
          {step.description} ({step.action}; {step.chain.ecosystem === 'evm'
            ? `chain ${step.chain.chainId}` : step.chain.name})
        </li>
      ))}</ol>
    </article>
  )
}

export function PlanResults({ candidates }: { candidates: RouteCandidate[] }) {
  return (
    <section className="panel">
      <div className="section-top">
        <div>
          <h2>Candidate plans</h2>
          <p className="muted">Compare providers, output representations, fees, and gas.</p>
        </div>
        <span className="badge">{candidates.length} plans</span>
      </div>
      {candidates.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">⇄</span>
          <h3>Planning integration pending</h3>
          <p>A future planning service will query ParaSpell, LI.FI, and Wormhole. Validated quotes will appear here for comparison against your constraints.</p>
          <div className="provider-tags"><span>ParaSpell</span><span>LI.FI</span><span>Wormhole</span></div>
          <small>No routes, output estimates, or fees have been requested.</small>
        </div>
      ) : (
        <div className="candidate-grid">
          {candidates.map(candidate => <CandidateCard candidate={candidate} key={candidate.id} />)}
        </div>
      )}
    </section>
  )
}
