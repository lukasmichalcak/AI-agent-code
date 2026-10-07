import { initialFields, validateRequest, type RequestFields } from './request'

export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string }
export interface Conversation {
  id: string
  fields: RequestFields
  messages: ChatMessage[]
  draft: string
  reviewed: boolean
  updatedAt: string
}
export const conversationStorageKey = 'relay.conversations.v1'
export function newConversation(): Conversation {
  return { id: crypto.randomUUID(), fields: { ...initialFields }, messages: [], draft: '', reviewed: false, updatedAt: new Date().toISOString() }
}
export function conversationTitle(conversation: Conversation): string {
  return conversation.messages.find(message => message.role === 'user')?.text || conversation.fields.naturalLanguage || 'New conversation'
}
// Saved browser data is untrusted. Accept only the shape this UI can render.
function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !item.id || typeof item.draft !== 'string' || typeof item.reviewed !== 'boolean' || typeof item.updatedAt !== 'string') return false
  if (!item.fields || typeof item.fields !== 'object') return false
  const fields = item.fields as Record<string, unknown>
  if (!Object.entries(initialFields).every(([key, defaultValue]) => typeof fields[key] === typeof defaultValue)) return false
  if (!['native', 'erc20'].includes(String(fields.sourceKind)) || !['native', 'erc20'].includes(String(fields.destinationKind))) return false
  if (!Array.isArray(item.messages) || !item.messages.every(message => message && typeof message.id === 'string' && ['user', 'assistant'].includes(message.role) && typeof message.text === 'string')) return false
  return !item.reviewed || Object.keys(validateRequest(fields as unknown as RequestFields)).length === 0
}
export function loadConversations(): { conversations: Conversation[]; activeId: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(conversationStorageKey) || 'null')
    if (saved && Array.isArray(saved.conversations) && saved.conversations.length && saved.conversations.every(isConversation)) {
      const conversations: Conversation[] = saved.conversations
      if (new Set(conversations.map(item => item.id)).size === conversations.length) {
        return { conversations, activeId: conversations.some(item => item.id === saved.activeId) ? saved.activeId : conversations[0].id }
      }
    }
  } catch { /* A fresh session also works when storage is unavailable. */ }
  const conversation = newConversation()
  return { conversations: [conversation], activeId: conversation.id }
}
