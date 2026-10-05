import { useRef, useState } from 'react'
import { RequestForm } from './components/RequestForm'
import { ReviewPanel } from './components/ReviewPanel'
import { PlanResults } from './components/PlanResults'
import { TransferProgress } from './components/TransferProgress'
import { WalletPanel, useWalletSession } from './wallet/WalletPanel'
import type { TransferIntent } from './domain/types'

export function App() {
  const [reviewed, setReviewed] = useState<TransferIntent | null>(null)
  const reviewRef = useRef<HTMLDivElement>(null)
  const wallet = useWalletSession()
  return <>
    <header className="header"><div className="header-inner"><a className="brand" href="#main"><span className="brand-mark" aria-hidden="true">↗</span><span>relay<span className="brand-sub">Interoperability router</span></span></a><span className="environment"><span className="dot" />Frontend milestone · Testnets</span></div></header>
    <main id="main" className="page"><div className="intro"><div><p className="eyebrow">CROSS-CHAIN TRANSFER WORKSPACE</p><h1>One request.<br />A clearer path across chains.</h1><p className="lede">Set your destination and your limits. Review every detail before a future agent finds a route.</p></div><WalletPanel /></div>
      <div className="milestone-note"><span aria-hidden="true">ⓘ</span><p><strong>What this demo proves:</strong> EVM wallet connection, native testnet balance reading, and request review. SDK planning and execution are pending. LI.FI transfers are not demonstrated on testnets. Polkadot requires a separate wallet adapter.</p></div>
      <div className="workflow"><div><RequestForm connectedAddress={wallet.ecosystem === 'evm' && wallet.status === 'connected' ? wallet.address : undefined} onEdit={() => setReviewed(null)} onReview={intent => { setReviewed(intent); requestAnimationFrame(() => { reviewRef.current?.focus(); reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }) }} /></div><aside><div ref={reviewRef} tabIndex={-1} className="review-focus"><ReviewPanel intent={reviewed} /></div><div className="boundary-note"><h3>You stay in control</h3><p>Connecting a wallet and reviewing a request only prepare the workflow. A real quote and a separate approval step are required before signing can become available.</p></div></aside></div>
      <PlanResults candidates={[]} /><TransferProgress execution={null} />
      <footer><span>Relay · Master’s thesis prototype</span><span>ParaSpell / LI.FI / Wormhole integrations planned</span></footer>
    </main>
  </>
}
