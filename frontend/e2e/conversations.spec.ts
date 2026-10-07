import { expect, test } from '@playwright/test'

test('conversation drafts, reviews and history survive view changes and reload', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Message', { exact: true }).fill('Move ETH to Arbitrum')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('log')).toContainText('Move ETH to Arbitrum')
  await expect(page.getByRole('log')).toContainText('Automatic interpretation and route planning are not connected yet.')
  await page.getByRole('button', { name: 'Open transfer details' }).click()
  await expect(page.getByLabel('Amount to send')).toHaveValue('')
  await page.getByLabel('Amount to send').fill('0.15')
  await page.getByLabel('Recipient address', { exact: true }).fill('0x1111111111111111111111111111111111111111')
  await page.getByRole('button', { name: 'Review request' }).click()
  await expect(page.getByRole('tab', { name: 'Review', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('0.15 ETH', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Chat', exact: true }).click()
  await page.getByLabel('Message', { exact: true }).fill('Unsent follow-up')
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('')
  await page.getByRole('tab', { name: 'Transfer details', exact: true }).click()
  await expect(page.getByLabel('Amount to send')).toHaveValue('')
  await page.getByRole('navigation', { name: 'Conversation history' }).getByRole('button', { name: 'Move ETH to Arbitrum' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Unsent follow-up')
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await expect(page.getByText('0.15 ETH', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('relay.conversations.v1') || '{}').conversations?.length)).toBe(2)
  await page.reload()
  await expect(page.getByRole('log')).toContainText('Move ETH to Arbitrum')
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Unsent follow-up')
  await page.getByRole('tab', { name: 'Transfer details', exact: true }).click()
  await expect(page.getByLabel('Amount to send')).toHaveValue('0.15')
  await page.getByLabel('Amount to send').fill('0.2')
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await expect(page.getByText('0.15 ETH', { exact: true })).not.toBeVisible()
  await expect(page.locator('.review-list')).toHaveCount(0)
})

test('tabs reveal mounted views within 100 ms without navigation or network requests', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  const timings = await page.evaluate(async () => {
    const results: { view: string; ms: number }[] = []
    const originalForm = document.querySelector('#view-details form')
    for (const view of ['details', 'review', 'plans', 'progress', 'wallet', 'chat', 'details']) {
      const start = performance.now()
      document.getElementById(`tab-${view}`)!.click()
      await new Promise<void>(resolve => {
        const observer = new MutationObserver(() => {
          if (!document.getElementById(`view-${view}`)!.hidden) { observer.disconnect(); resolve() }
        })
        observer.observe(document.getElementById(`view-${view}`)!, { attributes: true, attributeFilter: ['hidden'] })
        if (!document.getElementById(`view-${view}`)!.hidden) { observer.disconnect(); resolve() }
      })
      results.push({ view, ms: performance.now() - start })
    }
    if (document.querySelector('#view-details form') !== originalForm) throw new Error('Form remounted during switching')
    return results
  })
  for (const result of timings) expect(result.ms, `${result.view} switch`).toBeLessThan(100)
  expect(requests).toEqual([])
  expect(page.url()).toMatch(/\/$/)
  console.log('View switch timings (ms):', timings)
  await page.getByRole('tab', { name: 'Chat', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Transfer details', exact: true })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Transfer details', exact: true })).toHaveAttribute('aria-selected', 'true')
})

test('mobile history drawer and all views fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Conversation history' })).not.toBeVisible()
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Conversation history' })).toBeVisible()
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Conversation history' })).not.toBeVisible()
  for (const name of ['Chat', 'Transfer details', 'Review', 'Plans', 'Progress', 'Wallet']) {
    await page.getByRole('tab', { name, exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.getByRole('tabpanel')).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Chat', exact: true }).click()
  await page.screenshot({ path: 'test-results/chat-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'test-results/chat-desktop.png' })
})
