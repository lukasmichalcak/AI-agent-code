import type { PlanningOutcome } from '../integrations/planner'
const reasons: Record<string,string> = {
  intent_id_mismatch:'The quote belongs to a different request.',
  input_amount_mismatch:'The quoted input amount differs from your request.',
  zero_output:'The quote would return no destination asset.',
  stale_or_future_quote:'The quote timestamp is too old or invalid.',
  expired_quote:'The quote has expired.',
  unknown_destination_representation:'The exact destination representation could not be verified.',
  wrapped_not_allowed:'This plan returns a wrapped token, which your request disallows.',
  unknown_total_fee:'The full fee is unknown, so your maximum fee cannot be checked.',
  fee_limit:'The reported fee exceeds your limit.',
  unknown_minimum_output:'The provider did not supply a minimum output for your requested limit.',
  minimum_output_limit:'The quoted minimum output is below your requested amount.',
  unknown_duration:'The provider did not supply a duration for your time limit.',
  duration_limit:'The estimated duration exceeds your limit.',
  balance_unverified:'A required balance could not be verified.',
  insufficient_balance_or_gas:'The available asset or gas balance does not cover this plan.',
  duplicate_candidate_id:'The provider returned duplicate quote identifiers.',
  candidate_identity_or_schema_mismatch:'The quoted chain, token identity or amount does not match the request.',
  invalid_minimum_output:'The provider minimum output is inconsistent with its expected output.',
}
export function PlanningStatus({ outcome }: { outcome: PlanningOutcome }) {
  return <div className="panel" role="status">
    <p>{outcome.message}</p>
    {outcome.selectedId && <p>A candidate has been selected for review.</p>}
    {outcome.rejected.map(row => <div key={row.id}><strong>{row.provider}</strong>{row.reasons.map(reason => <p key={reason}>{reasons[reason] ?? 'This candidate could not be validated.'}</p>)}</div>)}
    {outcome.errors.length > 0 && <p className="error">Some checks failed or the provider comparison is incomplete. Review the available alternatives and retry if needed.</p>}
    <details><summary>Run details</summary><small>Trace: {outcome.traceId} · Selected quote: {outcome.selectedId ?? 'none'}</small>{outcome.errors.map((row,index) => <p key={index}>{row.tool}: {row.error}</p>)}</details>
  </div>
}
