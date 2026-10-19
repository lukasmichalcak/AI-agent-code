import { test, expect } from '@playwright/test'
test('real frontend proxy and FastAPI fixture pipeline',async({page})=>{
 test.skip(!process.env.RUN_STACK_E2E,'Enable when the real fixture backend is running')
 await page.goto('/')
 const address='0x1111111111111111111111111111111111111111'
 await page.getByLabel('Public source account for read-only checks').fill(address)
 await page.getByRole('tab',{name:'Transfer details',exact:true}).click()
 await page.getByLabel('Amount to send').fill('0.1');await page.getByLabel('Recipient address',{exact:true}).fill(address)
 await page.getByRole('button',{name:'Review request'}).click();await page.getByRole('button',{name:'Request read-only plans'}).click()
 await expect(page.locator('.candidate .badge')).toHaveText('Synthetic fixture')
 await expect(page.locator('.candidate')).toContainText('0.099 ETH')
 await expect(page.getByRole('status')).toContainText('No transaction is signed or submitted')
})
