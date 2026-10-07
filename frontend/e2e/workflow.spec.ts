import { expect, test } from '@playwright/test'
import { encodeAbiParameters } from 'viem'

test('request review, errors, custom token identity and responsive layout', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Plans', exact: true }).click()
  await expect(page.getByText('Planning integration pending', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Transfer details', exact: true }).click()
  await page.getByRole('button', { name: 'Review request' }).click()
  await expect(page.locator('#amount-error')).toBeVisible()
  await expect(page.locator('#recipient-error')).toBeVisible()
  await page.getByText('Request context', { exact: true }).click()
  await page.getByLabel('Natural-language task', { exact: true }).fill('Send 2 USDC; this text must not change the fields.')
  await page.getByLabel('Amount to send').fill('0.1')
  await page.getByLabel('Recipient address', { exact: true }).fill('0x1111111111111111111111111111111111111111')
  await page.getByLabel('Maximum total fee (USD, optional)').fill('1.00')
  await page.getByRole('button', { name: 'Review request' }).click()
  await expect(page.getByText('0.1 ETH', { exact: true })).toBeVisible()
  await expect(page.locator('.task-copy')).toHaveText('Send 2 USDC; this text must not change the fields.')
  await page.getByRole('button', { name: 'Edit transfer details' }).click()
  await page.getByLabel('Amount to send').fill('0.2')
  await expect(page.getByText('Request reviewed.', { exact: false })).toHaveCount(0)
  await page.getByLabel('Source asset', { exact: true }).selectOption('erc20')
  await page.locator('#sourceAddress').fill('0x2222222222222222222222222222222222222222')
  await page.locator('#sourceSymbol').fill('USDC')
  await page.locator('#sourceDecimals').fill('6')
  await page.getByRole('button', { name: 'Review request' }).click()
  await expect(page.getByText('0.2 USDC', { exact: true })).toBeVisible()
  await expect(page.locator('.review-list')).toContainText('0x2222222222222222222222222222222222222222')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/workflow-${width}.png`, fullPage: true })
  }
})

test('injected wallet rejection, live balance, changes, unsupported chain, errors and disconnect', async ({ page }) => {
  // Test-only EIP-1193 provider. It supplies no signer and never enters production code.
  await page.addInitScript(() => {
    let accounts = ['0x1111111111111111111111111111111111111111']
    let chainId = '0x14a34'
    let reject = true
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const provider = {
      isMetaMask: true,
      on(event: string, callback: (...args: unknown[]) => void) { listeners.set(event, [...(listeners.get(event) ?? []), callback]) },
      removeListener(event: string, callback: (...args: unknown[]) => void) { listeners.set(event, (listeners.get(event) ?? []).filter(fn => fn !== callback)) },
      async request({ method, params }: { method: string; params?: Array<{ chainId: string }> }) {
        if (method === 'eth_requestAccounts') { if (reject) { reject = false; throw Object.assign(new Error('User rejected connection'), { code: 4001 }) } return accounts }
        if (method === 'eth_accounts') return accounts
        if (method === 'eth_chainId') return chainId
        if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }]
        if (method === 'wallet_revokePermissions') return null
        if (method === 'wallet_switchEthereumChain') { chainId = params![0].chainId; for (const callback of listeners.get('chainChanged') ?? []) callback(chainId); return null }
        throw new Error(`Unexpected wallet method ${method}`)
      },
      changeAccount() { accounts = ['0x3333333333333333333333333333333333333333']; for (const callback of listeners.get('accountsChanged') ?? []) callback(accounts) },
      changeChain(value: string) { chainId = value; for (const callback of listeners.get('chainChanged') ?? []) callback(chainId) },
    }
    Object.assign(window, { ethereum: provider })
  })
  let failBalance = false
  await page.route(/https:\/\/(sepolia\.base\.org|sepolia-rollup\.arbitrum\.io)\//, async route => {
    const body = route.request().postDataJSON()
    const ethBalance = encodeAbiParameters([{ type: 'uint256' }], [10n ** 18n])
    const multicallResult = encodeAbiParameters([{ type: 'tuple[]', components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }] }], [[{ success: true, returnData: ethBalance }]])
    const response = (request: { id: number; method: string }) => failBalance ? { id: request.id, jsonrpc: '2.0', error: { code: -32000, message: 'RPC unavailable in test' } } : { id: request.id, jsonrpc: '2.0', result: request.method === 'eth_call' ? multicallResult : request.method === 'eth_getBalance' ? '0xde0b6b3a7640000' : '0x14a34' }
    await route.fulfill({ json: Array.isArray(body) ? body.map(response) : response(body) })
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Wallet', exact: true }).click()
  await page.getByRole('button', { name: 'Connect browser wallet' }).first().click()
  await expect(page.getByRole('alert')).toContainText('rejected')
  await page.getByRole('button', { name: 'Connect browser wallet' }).first().click()
  await expect(page.locator('.balance strong')).toHaveText('1 ETH')
  await page.evaluate(() => (window as unknown as { ethereum: { changeAccount(): void } }).ethereum.changeAccount())
  await expect(page.locator('.wallet-panel .address')).toHaveText('0x3333333333333333333333333333333333333333')
  await expect(page.getByRole('status').filter({ hasText: 'Wallet account changed' })).toBeVisible()
  await page.evaluate(() => (window as unknown as { ethereum: { changeChain(value: string): void } }).ethereum.changeChain('0x1'))
  await expect(page.getByText('Unsupported chain (1)', { exact: false })).toBeVisible()
  await expect(page.getByText('Unavailable on this chain', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to Arbitrum Sepolia' }).click()
  await expect(page.locator('.balance strong')).toHaveText('1 ETH')
  await expect(page.getByRole('status').filter({ hasText: 'Wallet network changed' })).toBeVisible()
  failBalance = true
  await page.getByRole('button', { name: 'Refresh balance' }).click()
  await expect(page.getByRole('alert')).toContainText('Could not read balance', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Connect browser wallet' }).first()).toBeVisible()
  await expect(page.locator('.wallet-panel .address')).toHaveCount(0)
})
