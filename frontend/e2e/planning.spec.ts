import { test, expect } from '@playwright/test'
const address = '0x1111111111111111111111111111111111111111'
const asset = (id:number) => ({chain:{ecosystem:'evm',chainId:id},kind:'native',symbol:'ETH',decimals:18})
const make = (body: Record<string, unknown>) => {
  const intent = body.intent as {id:string,sourceAsset:unknown,destinationAsset:unknown,amount:string} ?? {id:'parsed',naturalLanguage:'Send 0.1 ETH',sourceAsset:asset(84532),destinationAsset:asset(421614),amount:'0.1',recipient:address,constraints:{allowWrapped:false,preference:'cost'}}
  return {status:'ready',message:'Read-only fixture plan ready. No transaction submitted.',intent,candidates:[{id:'fixture-quote',intentId:intent.id,provider:'lifi',sourceAsset:intent.sourceAsset,sourceInput:{asset:intent.sourceAsset,amount:intent.amount},destinationAsset:intent.destinationAsset,destinationRepresentation:'native',expectedOutput:{asset:intent.destinationAsset,amount:'0.099'},minimumOutput:{asset:intent.destinationAsset,amount:'0.098'},fees:[],gasNeeds:[],totalUserCostUsd:'0.03',feeComplete:true,quotedAt:new Date().toISOString(),warnings:['Synthetic fixture'],steps:[],provenance:'fixture'}],selectedId:'fixture-quote',rejected:[],errors:[],traceId:'browser-test',executionEnabled:false}
}
test('review to backend plan to validated fixture card; editing invalidates estimates', async ({page}) => {
  await page.route('**/api/plan',async route => {
    const body = route.request().postDataJSON(); expect(body.mode).toBe('deterministic'); expect(body.wallets[0].address).toBe(address)
    await route.fulfill({json:make(body)})
  })
  await page.goto('/')
  await page.getByLabel('Public source account for read-only checks').fill(address)
  await page.getByRole('tab',{name:'Transfer details',exact:true}).click()
  await page.getByLabel('Amount to send').fill('0.1')
  await page.getByLabel('Recipient address',{exact:true}).fill(address)
  await page.getByRole('button',{name:'Review request'}).click()
  await page.getByRole('button',{name:'Request read-only plans'}).click()
  await expect(page.locator('.candidate .badge')).toBeVisible()
  await expect(page.locator('.candidate')).toContainText('0.099 ETH')
  await expect(page.getByRole('status')).toContainText('No transaction submitted')
  await page.getByRole('tab',{name:'Transfer details',exact:true}).click()
  await page.getByLabel('Amount to send').fill('0.2')
  await page.getByRole('tab',{name:'Plans',exact:true}).click()
  await expect(page.locator('.candidate')).toHaveCount(0)
})
test('chat interprets through backend and fills request for explicit review',async({page}) => {
 await page.route('**/api/chat',async route => {const b=route.request().postDataJSON();expect(b.message).toContain('0.1');await route.fulfill({json:make(b)})})
 await page.goto('/');await page.getByLabel('Message',{exact:true}).fill('Send 0.1 native ETH from Base Sepolia to Arbitrum Sepolia');await page.getByRole('button',{name:'Send message'}).click()
 await expect(page.getByRole('log')).toContainText('Read-only fixture plan ready')
 await page.getByRole('tab',{name:'Transfer details',exact:true}).click();await expect(page.getByLabel('Amount to send')).toHaveValue('0.1')
 await page.getByRole('tab',{name:'Review',exact:true}).click();await expect(page.locator('.review-list')).toHaveCount(0)
})
test('reject malformed backend response and preserve cancellation',async({page})=>{
 await page.route('**/api/chat',async route=>route.fulfill({json:{status:'ready',executionEnabled:true}}))
 await page.goto('/');await page.getByLabel('Message',{exact:true}).fill('A request');await page.getByRole('button',{name:'Send message'}).click()
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.candidate')).toHaveCount(0)
})
