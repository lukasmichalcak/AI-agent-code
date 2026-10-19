import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { ConversationHistory } from './components/ConversationHistory'
import { RequestForm } from './components/RequestForm'
import { ReviewPanel } from './components/ReviewPanel'
import { PlanningStatus } from './components/PlanningStatus'
import { PlanResults } from './components/PlanResults'
import { TransferProgress } from './components/TransferProgress'
import { WalletPanel, useWalletSession } from './wallet/WalletPanel'
import { conversationTitle, conversationStorageKey, loadConversations, newConversation, type Conversation } from './domain/conversations'
import { createIntent, fieldsFromIntent } from './domain/request'

import { planningService, type PlanningOutcome } from './integrations/planner'
import type { WalletSession } from './domain/types'

const views = [
  { id: 'chat', label: 'Chat' }, { id: 'details', label: 'Transfer details' },
  { id: 'review', label: 'Review' }, { id: 'plans', label: 'Plans' },
  { id: 'progress', label: 'Progress' }, { id: 'wallet', label: 'Wallet' },
] as const
type View = typeof views[number]['id']

export function App() {
  const [session, setSession] = useState(loadConversations)
  const [outcomes, setOutcomes] = useState<Record<string, PlanningOutcome>>({})
  const [busy, setBusy] = useState(false)
  const [backendError, setBackendError] = useState('')
  const [publicAccount, setPublicAccount] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const [view, setView] = useState<View>('chat')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const reviewRef = useRef<HTMLDivElement>(null)
  const wallet = useWalletSession()
  const conversation = session.conversations.find(item => item.id === session.activeId)!
  const reviewed = useMemo(() => conversation.reviewed ? createIntent(conversation.fields) : null, [conversation.reviewed, conversation.fields])
  useEffect(() => { abortRef.current?.abort(); setBusy(false); setOutcomes({}) }, [wallet.address, wallet.status, wallet.ecosystem === 'evm' ? wallet.chainId : wallet.genesisHash])
  const outcome = outcomes[conversation.id]
  const invalidate = () => { abortRef.current?.abort(); setBusy(false); setBackendError(''); setOutcomes({}) }
  const inspectionWallets = (): WalletSession[] => publicAccount.trim() ? [{ ecosystem: publicAccount.trim().startsWith('0x') ? 'evm' : 'substrate', address: publicAccount.trim() as `0x${string}`, status: 'connected' }] : [wallet]
  // All views are bundled and stay mounted. Switching only changes visibility.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(conversationStorageKey, JSON.stringify(session)); setStorageError(false) }
      catch { setStorageError(true) }
    }, 250)
    const flush = () => { try { localStorage.setItem(conversationStorageKey, JSON.stringify(session)) } catch { /* Keep session in memory. */ } }
    window.addEventListener('pagehide', flush)
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', flush) }
  }, [session])
  function updateConversation(update: (current: Conversation) => Conversation) {
    setSession(current => ({ ...current, conversations: current.conversations.map(item => item.id === current.activeId ? { ...update(item), updatedAt: new Date().toISOString() } : item) }))
  }
  async function sendMessage() {
    if (!conversation.draft.trim() || busy) return
    const id = conversation.id, text = conversation.draft.trim(), history = conversation.messages.slice(-12).map(({role,text}) => ({role,text}))
    updateConversation(current => ({ ...current, draft: '', reviewed: false, fields: { ...current.fields, naturalLanguage: text }, messages: [...current.messages, { id: crypto.randomUUID(), role: 'user', text }] }))
    const abort = new AbortController(); abortRef.current?.abort(); abortRef.current = abort
    setBusy(true); setBackendError(''); setOutcomes(current => { const next = {...current}; delete next[id]; return next })
    try {
      const result = await planningService.chat(text, history, inspectionWallets(), abort.signal)
      if (abort.signal.aborted) return
      setOutcomes(current => ({...current,[id]:result}))
      setSession(current => ({ ...current, conversations: current.conversations.map(item => item.id === id ? {...item, fields: result.intent ? fieldsFromIntent(result.intent) : item.fields, reviewed:false, messages:[...item.messages,{id:crypto.randomUUID(),role:'assistant',text:result.message}],updatedAt:new Date().toISOString()} : item) }))
    } catch (error) {
      if (!abort.signal.aborted) {
        const message = error instanceof Error ? error.message : 'Backend request failed'
        setBackendError(message)
        setSession(current => ({...current,conversations:current.conversations.map(item => item.id === id ? {...item,messages:[...item.messages,{id:crypto.randomUUID(),role:'assistant',text:message}]} : item)}))
      }
    } finally { if (abortRef.current === abort) setBusy(false) }
  }
  async function requestPlans() {
    if (!reviewed || busy) return
    const id = conversation.id, abort = new AbortController(); abortRef.current?.abort(); abortRef.current = abort
    setBusy(true); setBackendError(''); setView('plans')
    try { const result = await planningService.plan(reviewed, inspectionWallets(), abort.signal); if (!abort.signal.aborted) setOutcomes(current => ({...current,[id]:result})) }
    catch(error) { if (!abort.signal.aborted) setBackendError(error instanceof Error ? error.message : 'Planning failed') }
    finally { if (abortRef.current === abort) setBusy(false) }
  }
  function startConversation() {
    invalidate()
    const next = newConversation()
    setSession(current => ({ conversations: [next, ...current.conversations], activeId: next.id }))
    setView('chat'); setHistoryOpen(false)
  }
  return <div className="app-shell">
    <header className="header"><div className="header-inner">
      <a className="brand" href="#main" onClick={() => setView('chat')}><span className="brand-mark" aria-hidden="true">↗</span><span>Cross-chain<span className="brand-sub">Interoperability assistant</span></span></a>
      <div className="header-actions"><button className="secondary wallet-shortcut" onClick={() => setView('wallet')}><span className={`dot ${wallet.status === 'connected' ? 'connected' : ''}`} />{wallet.status === 'connected' ? 'Wallet connected' : 'Connect wallet'}</button><button className="secondary history-toggle" aria-expanded={historyOpen} aria-controls="conversation-history" onClick={() => setHistoryOpen(open => !open)}>History</button></div>
    </div></header>
    <div className="workspace-shell">
      <main id="main" className="workspace-main">
        <div className="workspace-heading"><div><p className="eyebrow">CROSS-CHAIN ASSISTANT</p><h2 className="conversation-heading" title={conversationTitle(conversation)}>{conversationTitle(conversation)}</h2></div></div>
        <div className="inspection-account"><label htmlFor="inspection-account">Public source account for read-only checks (optional if wallet connected)</label><input id="inspection-account" placeholder="0x… or SS58…" value={publicAccount} onChange={event => { invalidate(); setPublicAccount(event.target.value) }} /><small>This does not connect a signer or authorize a transfer.</small></div>
        {busy && <p role="status">Inspecting request and routes… <button className="secondary" onClick={invalidate}>Cancel</button></p>}
        {backendError && <p role="alert" className="error">{backendError}</p>}
        <div className="view-tabs" role="tablist" aria-label="Workspace views">{views.map((item, index) => <button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={view === item.id} aria-controls={`view-${item.id}`} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)} onKeyDown={event => {
          let nextIndex: number | undefined
          if (event.key === 'ArrowRight') nextIndex = (index + 1) % views.length
          if (event.key === 'ArrowLeft') nextIndex = (index + views.length - 1) % views.length
          if (event.key === 'Home') nextIndex = 0
          if (event.key === 'End') nextIndex = views.length - 1
          if (nextIndex !== undefined) { event.preventDefault(); setView(views[nextIndex].id); document.getElementById(`tab-${views[nextIndex].id}`)?.focus() }
        }}>{item.label}{item.id === 'review' && conversation.reviewed && <span className="review-dot" aria-hidden="true" title="Request reviewed" />}</button>)}</div>
        <div className="view-panel chat-view" role="tabpanel" id="view-chat" aria-labelledby="tab-chat" hidden={view !== 'chat'} tabIndex={0}>
          <ChatWindow busy={busy} conversation={conversation} active={view === 'chat'} onDraft={draft => updateConversation(current => ({ ...current, draft }))} onSend={sendMessage} onDetails={() => setView('details')} />
        </div>
        <div className="view-panel" role="tabpanel" id="view-details" aria-labelledby="tab-details" hidden={view !== 'details'} tabIndex={0}>
          <div className="view-content"><RequestForm key={conversation.id} fields={conversation.fields} onChange={fields => { invalidate(); updateConversation(current => ({ ...current, fields, reviewed: false })) }} connectedAddress={wallet.ecosystem === 'evm' && wallet.status === 'connected' ? wallet.address : undefined} onReview={() => {
            updateConversation(current => ({ ...current, reviewed: true })); setView('review')
            requestAnimationFrame(() => reviewRef.current?.focus())
          }} /></div>
        </div>
        <div ref={reviewRef} className="view-panel" role="tabpanel" id="view-review" aria-labelledby="tab-review" hidden={view !== 'review'} tabIndex={0}>
          <div className="view-content"><ReviewPanel intent={reviewed} /><div className="view-actions"><button className="secondary" onClick={() => setView('details')}>Edit transfer details</button>{reviewed && <button disabled={busy} onClick={requestPlans}>Request read-only plans →</button>}</div></div>
        </div>
        <div className="view-panel" role="tabpanel" id="view-plans" aria-labelledby="tab-plans" hidden={view !== 'plans'} tabIndex={0}><div className="view-content">{outcome && <PlanningStatus outcome={outcome} />}<PlanResults candidates={outcome?.candidates ?? []} /></div></div>
        <div className="view-panel" role="tabpanel" id="view-progress" aria-labelledby="tab-progress" hidden={view !== 'progress'} tabIndex={0}><div className="view-content"><TransferProgress execution={null} /></div></div>
        <div className="view-panel" role="tabpanel" id="view-wallet" aria-labelledby="tab-wallet" hidden={view !== 'wallet'} tabIndex={0}><div className="view-content wallet-view"><WalletPanel /></div></div>
        <footer><span>Request → Review → Plans → Progress</span></footer>
      </main>
      {historyOpen && <button className="history-backdrop" aria-label="Close conversation history" onClick={() => setHistoryOpen(false)} />}
      <aside id="conversation-history" className={`history-pane ${historyOpen ? 'is-open' : ''}`} aria-label="Saved conversations">
        <ConversationHistory conversations={session.conversations} activeId={session.activeId} storageError={storageError} onNew={startConversation} onClose={() => setHistoryOpen(false)} onSelect={id => { invalidate(); setSession(current => ({ ...current, activeId: id })); setView('chat'); setHistoryOpen(false) }} />
      </aside>
    </div>
  </div>
}
