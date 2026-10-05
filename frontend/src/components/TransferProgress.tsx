import type { TransferExecution, TransferStatus } from '../domain/types'

const labels: Record<TransferStatus, string> = { 'awaiting-approval': 'Awaiting explicit approval', 'source-submitted': 'Source submitted', 'in-progress': 'Transfer in progress', 'destination-completed': 'Destination completed', failed: 'Transfer failed' }
export function TransferProgress({ execution }: { execution: TransferExecution | null }) {
  return <section className="panel progress-panel"><div className="section-top"><h2>Transfer progress</h2><span className="badge">Observed transactions</span></div>
    {!execution ? <p className="muted">No transfer has started. After a real quote is validated and separately approved, source submission, transfer progress, and destination completion will appear here.</p> : <div role="status"><h3>{labels[execution.status]}</h3><p>Last update: {execution.updatedAt}</p>{execution.error && <p className="error" role="alert">{execution.error}</p>}<ul>{execution.transactions.map(transaction => <li className="address" key={`${transaction.phase}-${transaction.hash}`}>{transaction.phase} · {transaction.chain.ecosystem === 'evm' ? `chain ${transaction.chain.chainId}` : transaction.chain.name} · {transaction.hash}</li>)}</ul></div>}
  </section>
}
