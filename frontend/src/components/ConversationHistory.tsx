import { conversationTitle, type Conversation } from '../domain/conversations'

export function ConversationHistory({ conversations, activeId, onSelect, onNew, onClose, storageError }: {
  conversations: Conversation[]; activeId: string; onSelect: (id: string) => void; onNew: () => void; onClose: () => void; storageError: boolean
}) {
  return <>
    <div className="history-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Conversations</h2></div><button className="secondary history-close" onClick={onClose} aria-label="Close conversation history">×</button></div>
    <button className="new-conversation" onClick={onNew}><span aria-hidden="true">＋</span> New conversation</button>
    <p className="history-caption">{storageError ? 'History is available for this session only.' : 'Saved in this browser'}</p>
    <nav aria-label="Conversation history" className="history-list">
      {[...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(conversation => <button key={conversation.id} className={`history-item ${conversation.id === activeId ? 'selected' : ''}`} aria-current={conversation.id === activeId ? 'true' : undefined} onClick={() => onSelect(conversation.id)}>
        <span className="history-title">{conversationTitle(conversation)}</span><span className="history-meta">{conversation.reviewed ? 'Request reviewed' : conversation.messages.length ? 'Draft request' : 'Start a request'}</span>
      </button>)}
    </nav>
    <div className="history-footer"><span className="dot" /> Testnet prototype<p>Base Sepolia · Arbitrum Sepolia</p></div>
  </>
}
