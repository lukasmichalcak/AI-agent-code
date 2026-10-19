import { z } from 'zod'
import type { TransferIntent, WalletSession } from '../domain/types'
const decimal = z.string().regex(/^\d+(\.\d+)?$/)
const chain = z.union([
  z.object({ ecosystem: z.literal('evm'), chainId: z.number().int().positive() }),
  z.object({ ecosystem: z.literal('substrate'), name: z.string().min(1), genesisHash: z.string().optional() }),
])
const asset = z.object({ chain, kind: z.enum(['native','erc20','substrate']), symbol: z.string(), decimals: z.number().int().min(0).max(255), address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(), assetIdentifier: z.string().optional() }).superRefine((a,ctx) => {
  if (a.kind === 'erc20' && (a.chain.ecosystem !== 'evm' || !a.address)) ctx.addIssue({code:'custom',message:'Invalid ERC20 identity'})
  if (a.kind === 'native' && a.chain.ecosystem !== 'evm') ctx.addIssue({code:'custom',message:'Invalid native identity'})
  if (a.kind === 'substrate' && (a.chain.ecosystem !== 'substrate' || !a.assetIdentifier)) ctx.addIssue({code:'custom',message:'Invalid substrate identity'})
})
const amount = z.object({ asset, amount: decimal })
const constraints = z.object({ maximumFeeUsd: decimal.optional(), minimumReceived: decimal.optional(), allowWrapped: z.boolean(), maximumDurationSeconds: z.number().int().positive().optional(), preference: z.enum(['cost','speed','output']).optional() })
const intent = z.object({id:z.string(),naturalLanguage:z.string(),sourceAsset:asset,destinationAsset:asset,amount:decimal,recipient:z.string(),constraints})
const candidate = z.object({ id:z.string(),intentId:z.string(),provider:z.enum(['paraspell','lifi','wormhole']),sourceAsset:asset,sourceInput:amount,destinationAsset:asset,destinationRepresentation:z.enum(['native','canonical','wrapped','unknown']),expectedOutput:amount,minimumOutput:amount.optional(),fees:z.array(z.object({label:z.string(),amount,includedInInput:z.boolean(),estimatedUsd:decimal.optional()})),gasNeeds:z.array(amount),totalUserCostUsd:decimal.optional(),feeComplete:z.boolean(),estimatedDurationSeconds:z.number().int().nonnegative().optional(),quotedAt:z.string().datetime({offset:true}),expiresAt:z.string().datetime({offset:true}).optional(),warnings:z.array(z.string()),steps:z.array(z.object({id:z.string(),description:z.string(),chain,action:z.enum(['approval','swap','bridge','redeem','transfer'])})),provenance:z.enum(['live','fixture'])})
export const outcomeSchema = z.object({status:z.enum(['ready','clarification','rejected','unavailable','model_error']),message:z.string(),intent:intent.optional(),candidates:z.array(candidate),selectedId:z.string().optional(),rejected:z.array(z.object({id:z.string(),provider:z.string(),reasons:z.array(z.string())})),errors:z.array(z.object({tool:z.string(),error:z.string(),message:z.string().optional()}).passthrough()),traceId:z.string(),executionEnabled:z.literal(false)})
export type PlanningOutcome = Omit<z.infer<typeof outcomeSchema>, 'intent' | 'candidates'> & { intent?: TransferIntent; candidates: import('../domain/types').RouteCandidate[] }
async function post(path: string, body: unknown, signal?: AbortSignal): Promise<PlanningOutcome> {
  const response = await fetch(`/api/${path}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal})
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}. Check that the backend is running and inspect its trace.`)
  const parsed = outcomeSchema.parse(await response.json())
  return parsed as PlanningOutcome
}
export const planningService = {
  plan: (intent:TransferIntent,wallets:WalletSession[],signal?:AbortSignal) => post('plan',{intent,wallets,mode:'deterministic'},signal),
  chat: (message:string,history:{role:string;text:string}[],wallets:WalletSession[],signal?:AbortSignal) => post('chat',{message,history,wallets,mode:'two-role'},signal),
}
// The client has no signing or submission endpoint.
