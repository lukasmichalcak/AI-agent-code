import { useEffect, useRef, type FormEvent } from 'react'
import type { Conversation } from '../domain/conversations'

export function ChatWindow({ conversation, onDraft, onSend, onDetails, active }: {
  conversation: Conversation; onDraft: (value: string) => void; onSend: () => void; onDetails: () => void; active: boolean
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (active) endRef.current?.scrollIntoView({ block: 'nearest' }) }, [conversation.id, conversation.messages.length, active])
  function submit(event: FormEvent) { event.preventDefault(); onSend() }
  return <div className="chat-window">
    <div className="chat-transcript" role="log" aria-label="Conversation messages" aria-live="polite">
      {!conversation.messages.length ? <div className="chat-welcome">
        <span className="welcome-mark" aria-hidden="true">↗</span><p className="eyebrow">YOUR CROSS-CHAIN WORKSPACE</p>
        <h1>Where would you like<br />to move your assets?</h1>
        <p>Start with your goal. Then set the exact details and review your request, one step at a time.</p>
        <button className="suggestion" onClick={() => onDraft('Send ETH from Base Sepolia to Arbitrum Sepolia.')}>Send ETH between testnets <span aria-hidden="true">↗</span></button>
        <p className="muted">Prototype · Chat saves your goal; automatic planning is not connected yet.</p>
      </div> : <div className="message-list">{conversation.messages.map(message => <article key={message.id} className={`message ${message.role}`}>
        <span className="message-avatar" aria-hidden="true">{message.role === 'user' ? 'You' : '↗'}</span>
        <div><p className="message-author">{message.role === 'user' ? 'You' : 'Cross-chain assistant'}</p><p className="message-text">{message.text}</p>
          {message.role === 'assistant' && <button className="text-button" onClick={onDetails}>Open transfer details →</button>}
        </div>
      </article>)}</div>}
      <div ref={endRef} />
    </div>
    <form className="chat-composer" onSubmit={submit}>
      <label htmlFor="chat-draft" className="sr-only">Message</label>
      <textarea id="chat-draft" rows={2} value={conversation.draft} placeholder="Describe your transfer goal…" onChange={event => onDraft(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend() }
      }} />
      <div className="composer-bottom"><span>Enter to send · Shift + Enter for a new line</span><button type="submit" disabled={!conversation.draft.trim()} aria-label="Send message">Send <span aria-hidden="true">↑</span></button></div>
    </form>
    <p className="chat-footnote">Chat messages prepare a request. Transfers require a quote and separate approval.</p>
  </div>
}
