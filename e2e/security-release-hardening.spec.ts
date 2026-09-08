import { expect, test, type Request } from '@playwright/test'
import { collections, mockControlApi, navigateTo } from './control-fixtures'

test('UI076-03 destructive confirmation retains pending and failure state', async ({ page }) => {
  const verify = await mockControlApi(page)
  let finish: () => void = () => {}
  const response = new Promise<void>(resolve => { finish = resolve })
  await page.route('**/admin/api-keys/fixture-admin', async route => {
    await response
    await route.fulfill({ status: 503, body: 'synthetic-private-error' })
  })
  await page.goto('/admin/ui/keys')
  const trigger = page.getByRole('button', { name: 'Delete fixture-admin', exact: true })
  await trigger.click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Delete fixture-admin', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Applying...' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  finish()
  await expect(dialog.getByRole('alert')).toContainText('Admin key update failed (HTTP 503)')
  await expect(page.getByText('synthetic-private-error')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  verify()
})

test('UI076-01 valid session revalidation preserves a denied edit draft and rotates CSRF', async ({ page }) => {
  const verify = await mockControlApi(page)
  let sessionReads = 0
  let mutationCount = 0
  const tokens: string[] = []
  await page.route('**/admin/session', route => {
    sessionReads += 1
    return route.fulfill({ json: { authenticated: true, csrf_token: `synthetic-${sessionReads}`, expires_at: '2099-01-01T00:00:00Z' } })
  })
  await page.route('**/admin/credentials/fixture-access', route => {
    tokens.push(route.request().headers()['x-csrf-token'])
    mutationCount += 1
    return route.fulfill({ status: mutationCount === 1 ? 403 : 204 })
  })
  await page.goto('/admin/ui/credentials?mode=direct')
  await page.getByRole('button', { name: 'Edit fixture-access', exact: true }).click()
  await page.getByLabel('Azure account', { exact: true }).fill('preserveddraft')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => sessionReads).toBe(2)
  await expect(page.getByLabel('Azure account', { exact: true })).toHaveValue('preserveddraft')
  await expect(page).not.toHaveURL(/\/login$/)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(tokens).toEqual(['synthetic-1', 'synthetic-2'])
  verify()
})

test('UI076-01 logout discards an in-flight revalidation response', async ({ page }) => {
  const verify = await mockControlApi(page)
  let reads = 0
  let release: () => void = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/admin/session', async route => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 })
    reads += 1
    if (reads > 1) await held
    return route.fulfill({ json: { authenticated: true, csrf_token: 'synthetic-late-csrf', expires_at: '2099-01-01T00:00:00Z' } })
  })
  await page.goto('/admin/ui/health')
  await expect(page.getByText('healthy', { exact: true })).toBeVisible()
  await page.route('**/admin/health', route => route.fulfill({ status: 403 }))
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect.poll(() => reads).toBe(2)
  const settled = new Promise<void>(resolve => {
    const complete = (request: Request) => {
      if (!request.url().endsWith('/admin/session') || request.method() !== 'GET') return
      page.off('requestfinished', complete)
      page.off('requestfailed', complete)
      resolve()
    }
    page.on('requestfinished', complete)
    page.on('requestfailed', complete)
  })
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  release()
  await settled
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('healthy', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  verify()
})

test('UI076-01 confirmed revocation clears protected content and redirects', async ({ page }) => {
  const verify = await mockControlApi(page)
  await page.goto('/admin/ui/keys')
  await expect(page.getByText('fixture-admin', { exact: true })).toBeVisible()
  await page.route('**/admin/session', route => route.fulfill({ status: 403 }))
  await page.route('**/admin/api-keys', route => route.fulfill({ status: 403 }))
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('fixture-admin', { exact: true })).toHaveCount(0)
  verify()
})

test('UI078-01 failed logout blocks protected access until revocation retry succeeds', async ({ page }) => {
  const verify = await mockControlApi(page)
  let deletions = 0
  const deletionTokens: string[] = []
  await page.route('**/admin/session', route => {
    if (route.request().method() === 'DELETE') {
      deletions += 1
      deletionTokens.push(route.request().headers()['x-csrf-token'])
      return deletions === 1
        ? route.fulfill({ status: 503, body: 'synthetic-private-revocation-error' })
        : route.fulfill({ status: 204 })
    }
    return route.fulfill({ json: { authenticated: true, csrf_token: 'synthetic-recovery-csrf', expires_at: '2099-01-01T00:00:00Z' } })
  })
  await page.goto('/admin/ui/keys')
  await expect(page.getByText('fixture-admin', { exact: true })).toBeVisible()
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Session revocation pending' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Admin API key' })).toHaveCount(0)
  await expect(page.getByText('fixture-admin', { exact: true })).toHaveCount(0)
  await expect(page.getByText('synthetic-private-revocation-error')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Session revocation pending' })).toBeVisible()
  await page.goto('/admin/ui/keys')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('fixture-admin', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Retry revocation' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect(deletions).toBe(2)
  expect(deletionTokens).toEqual(['synthetic-recovery-csrf', 'synthetic-recovery-csrf'])
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  verify()
})

test('UI076-01 direct unauthenticated navigation never renders protected records', async ({ page }) => {
  const verify = await mockControlApi(page)
  await page.route('**/admin/session', route => route.fulfill({ status: 403 }))
  await page.goto('/admin/ui/keys')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('fixture-admin', { exact: true })).toHaveCount(0)
  verify()
})

test('UI076-01 expiry checks the authoritative session before clearing protected content', async ({ page }) => {
  const verify = await mockControlApi(page)
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') })
  let reads = 0
  await page.route('**/admin/session', route => {
    reads += 1
    return reads === 1
      ? route.fulfill({ json: { authenticated: true, csrf_token: 'synthetic-expiry-csrf', expires_at: '2030-01-01T00:00:10Z' } })
      : route.fulfill({ status: 403 })
  })
  await page.goto('/admin/ui/keys')
  await expect(page.getByText('fixture-admin', { exact: true })).toBeVisible()
  await page.clock.fastForward(10_001)
  await expect(page).toHaveURL(/\/login$/)
  expect(reads).toBe(2)
  await expect(page.getByText('fixture-admin', { exact: true })).toHaveCount(0)
  verify()
})

test('UI076-01 visibility and forbidden checks share one request and retain drafts during an outage', async ({ page }) => {
  const verify = await mockControlApi(page)
  let reads = 0
  let release: () => void = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/admin/session', async route => {
    reads += 1
    if (reads === 1) return route.fulfill({ json: { authenticated: true, csrf_token: 'synthetic-visibility-csrf', expires_at: '2099-01-01T00:00:00Z' } })
    await held
    return route.fulfill({ status: 503 })
  })
  await page.route('**/admin/credentials/fixture-access', route => route.fulfill({ status: 403 }))
  await page.goto('/admin/ui/credentials?mode=direct')
  await page.getByRole('button', { name: 'Edit fixture-access', exact: true }).click()
  await page.getByLabel('Azure account', { exact: true }).fill('visibilitydraft')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    window.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    window.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => reads).toBe(2)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('HTTP 403')
  const response = page.waitForResponse(reply => reply.url().endsWith('/admin/session') && reply.status() === 503)
  release()
  await response
  await expect(page.getByLabel('Azure account', { exact: true })).toHaveValue('visibilitydraft')
  await expect(page).not.toHaveURL(/\/login$/)
  expect(reads).toBe(2)
  verify()
})

for (const status of [400, 403, 404, 409, 503]) {
  test(`UI076-03 edit values survive HTTP ${status}`, async ({ page }) => {
    const verify = await mockControlApi(page)
    await page.route('**/admin/credentials/fixture-access', route => route.fulfill({ status, body: 'synthetic-private-error' }))
    await page.goto('/admin/ui/credentials?mode=direct')
    await page.getByRole('button', { name: 'Edit fixture-access', exact: true }).click()
    await page.getByLabel('Azure account', { exact: true }).fill('retaineddraft')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(`HTTP ${status}`)
    await expect(page.getByLabel('Azure account', { exact: true })).toHaveValue('retaineddraft')
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
    await expect(page.getByText('synthetic-private-error')).toHaveCount(0)
    verify()
  })
}

test('UI076-02 stored markup stays text and secrets require acknowledgement', async ({ page }) => {
  const verify = await mockControlApi(page)
  const hostileName = '<img src=x onerror=alert(1)>'
  const secret = 'synthetic-ui076-one-time-key'
  const logs: string[] = []
  const requests: string[] = []
  page.on('console', message => logs.push(message.text()))
  page.on('request', request => requests.push(`${request.url()} ${request.postData() ?? ''}`))
  await page.route('**/admin/api-keys', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [{ ...collections['/admin/api-keys'][0], key_name: hostileName }] })
    : route.fulfill({ status: 201, json: { api_key: secret } }))
  await page.goto('/admin/ui/keys')
  await expect(page.getByText(hostileName, { exact: true })).toBeVisible()
  await expect(page.locator('img[onerror]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create admin key', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('synthetic-key')
  await page.getByRole('button', { name: 'Create key', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(secret)
  await page.keyboard.press('Escape')
  await page.mouse.click(1, 1)
  await expect(dialog).toContainText(secret)
  await expect(dialog.getByRole('button', { name: 'I have stored this securely' })).toBeFocused()
  await dialog.getByRole('button', { name: 'I have stored this securely' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await page.content()).not.toContain(secret)
  await navigateTo(page, 'Health')
  await navigateTo(page, 'Admin keys')
  expect(await page.content()).not.toContain(secret)
  expect(JSON.stringify({ logs, requests })).not.toContain(secret)
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  verify()
})

test('UI076-03 route focus, keyboard tabs and responsive semantics survive 200 percent zoom', async ({ page }, testInfo) => {
  const verify = await mockControlApi(page)
  await page.goto('/admin/ui/keys')
  await expect(page.getByRole('heading', { name: 'Admin keys', exact: true })).toBeFocused()
  if (testInfo.project.name === 'mobile-chromium') {
    await expect(page.locator('.mobile-records > dl')).toHaveCount(1)
    await expect(page.locator('.mobile-records dt').first()).toHaveText('Name')
    await expect(page.getByRole('table')).toHaveCount(0)
  } else {
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()
    await expect(page.locator('.mobile-records')).toHaveCount(0)
  }
  await navigateTo(page, 'Policies')
  await expect(page.getByRole('heading', { name: 'Authorization policies' })).toBeFocused()
  const first = page.getByRole('tab', { name: 'Managed policies', exact: true })
  await first.focus()
  await page.keyboard.press('ArrowRight')
  const second = page.getByRole('tab', { name: 'Identity attachments', exact: true })
  await expect(second).toBeFocused()
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await page.evaluate(() => { document.body.style.zoom = '2' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('ui076-zoom.png'), fullPage: true })
  verify()
})