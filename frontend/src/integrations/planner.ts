import type { RouteCandidate, TransferIntent, WalletSession } from '../domain/types'

// Implement with an HTTP backend client later. Validate responses at the boundary.
export interface PlanningService {
  plan(intent: TransferIntent, wallets: WalletSession[], signal?: AbortSignal): Promise<RouteCandidate[]>
}
export interface RouterAdapter {
  provider: RouteCandidate['provider']
  quote(intent: TransferIntent, signal?: AbortSignal): Promise<RouteCandidate[]>
}
export const planningService: PlanningService | null = null
// Execution intentionally has no implementation or signing API in this milestone.
// Later: revalidate quote, wallet, constraints and expiry, then require separate approval.
