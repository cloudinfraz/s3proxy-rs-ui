import { expect, test } from '@playwright/test'
import { capabilities, collections, health, mockControlApi, navigateTo } from './control-fixtures'
import type { components } from '../src/api/schema'

test('UI069-01 grouped navigation, deep links, history and responsive layout', async ({ page }, testInfo) => {
  const verify = await mockControlApi(page)
  await page.goto('/admin/ui/')
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await navigateTo(page, 'Audit')
  await expect(page.getByRole('heading', { name: 'Audit', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Audit', exact: true })).toBeVisible()
  await navigateTo(page, 'Health')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Audit', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Health', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('health-layout.png'), fullPage: true })
  verify()
})

test('UI069-02 health retains last reading on refresh failure and recovers', async ({ page }) => {
  const verify = await mockControlApi(page)
  await page.goto('/admin/ui/health')
  await expect(page.getByText('healthy', { exact: true })).toBeVisible()
  await page.route('**/admin/health', route => route.fulfill({ status: 503, body: 'Health temporarily unavailable' }))
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Health temporarily unavailable')
  await expect(page.getByText('healthy', { exact: true })).toBeVisible()
  await expect(page.getByText('Last successful reading', { exact: true })).toBeVisible()
  await page.unroute('**/admin/health')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  verify()
})

test('UI069-03 keyboard navigation and unavailable capability states', async ({ page }) => {
  const verify = await mockControlApi(page)
  await page.route('**/admin/capabilities', route => route.fulfill({ json: { ...capabilities, sts_enabled: true } }))
  await page.goto('/admin/ui/')
  await expect(page.getByText('AssumeRole configuration is incomplete')).toBeVisible()
  await navigateTo(page, 'Temporary credentials')
  await expect(page.getByRole('heading', { name: 'AssumeRole partially configured' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) {
    await menu.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()
  }
  await page.getByRole('link', { name: 'S3 identities', exact: true }).last().focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'S3 identities', exact: true })).toBeVisible()
  verify()
})

test('UI069-04 one-time key dismissal, toggle and delete preserve metadata only', async ({ page }) => {
  const verify = await mockControlApi(page)
  let rows: components['schemas']['AdminApiKeySummary'][] = [...collections['/admin/api-keys']]
  const synthetic = 'synthetic-one-time-admin-key'
  const mutations: Array<{ method: string; body: string | null }> = []
  await page.route('**/admin/api-keys', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: rows })
    mutations.push({ method: route.request().method(), body: route.request().postData() })
    const created = { ...rows[0], id: 'new-key-id', key_name: 'new-admin' }
    rows = [...rows, created]
    return route.fulfill({ status: 201, json: { id: created.id, key_name: created.key_name, api_key: synthetic, description: null, expires_at: null, created_at: created.created_at, warning: 'One time' } satisfies components['schemas']['CreateAdminApiKeyResponse'] })
  })
  await page.route('**/admin/api-keys/new-admin', async route => {
    mutations.push({ method: route.request().method(), body: route.request().postData() })
    const enabled = route.request().method() === 'PUT' && route.request().postDataJSON().enabled === true
    rows = route.request().method() === 'DELETE' ? rows.filter(row => row.key_name !== 'new-admin') : rows.map(row => row.key_name === 'new-admin' ? { ...row, enabled, status: enabled ? 'active' : 'disabled' } : row)
    return route.fulfill({ status: 204 })
  })
  await page.goto('/admin/ui/keys')
  await page.getByRole('button', { name: 'Create admin key', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('new-admin')
  await page.getByRole('button', { name: 'Create key', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(synthetic)
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await expect(page.getByText(synthetic, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Disable new-admin', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Enable new-admin', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Enable new-admin', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Disable new-admin', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete new-admin', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'new-admin', exact: true })).toHaveCount(0)
  expect(JSON.stringify(mutations)).not.toContain(synthetic)
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  verify()
})

for (const transition of ['route transition', 'dismissal', 'logout'] as const) {
test(`UI069-06 late key response cannot restore a secret after ${transition}`, async ({ page }) => {
  const verify = await mockControlApi(page)
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  let creates = 0
  await page.route('**/admin/api-keys', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: collections['/admin/api-keys'] })
    creates += 1
    await gate
    return route.fulfill({ status: 201, json: { id: 'late-key-id', key_name: 'late-key', api_key: 'synthetic-late-secret', description: null, expires_at: null, created_at: health.timestamp, warning: 'One time' } satisfies components['schemas']['CreateAdminApiKeyResponse'] })
  })
  await page.goto('/admin/ui/')
  await navigateTo(page, 'Admin keys')
  await page.getByRole('button', { name: 'Create admin key', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('late-key')
  await page.getByRole('button', { name: 'Create key', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Creating...', exact: true })).toBeDisabled()
  await expect.poll(() => creates).toBe(1)
  if (transition === 'route transition') {
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  } else {
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    if (transition === 'logout') {
      await page.route('**/admin/session', route => route.request().method() === 'DELETE' ? route.fulfill({ status: 204 }) : route.fulfill({ status: 403 }))
      const menu = page.getByRole('button', { name: 'Open navigation' })
      if (await menu.isVisible()) await menu.click()
      await page.getByRole('button', { name: 'Sign out', exact: true }).click()
      await expect(page).toHaveURL(/\/login$/)
    }
  }
  const response = page.waitForResponse(reply => reply.url().endsWith('/admin/api-keys') && reply.request().method() === 'POST')
  release()
  await response
  if (transition === 'route transition') await navigateTo(page, 'Admin keys')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('synthetic-late-secret')).toHaveCount(0)
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  verify()
})
}

test('UI069-07 key creation failure remains retryable without duplicate submissions', async ({ page }) => {
  const verify = await mockControlApi(page)
  await page.route('**/admin/api-keys', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ json: collections['/admin/api-keys'] }))
  await page.goto('/admin/ui/keys')
  await page.getByRole('button', { name: 'Create admin key', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('retry-key')
  await page.getByRole('button', { name: 'Create key', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('HTTP 503')
  await expect(page.getByRole('button', { name: 'Create key', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  verify()
})

test('UI069-05 audit pages remain inside the selected recent event window', async ({ page }) => {
  const verify = await mockControlApi(page)
  const limits: number[] = []
  await page.route('**/admin/audit?*', route => {
    const limit = Number(new URL(route.request().url()).searchParams.get('limit'))
    limits.push(limit)
    const rows = Array.from({ length: Math.min(limit, 26) }, (_, index) => ({ id: `event-${index}`, entity_type: 'admin_key', entity_id: 'deleted-entity', action: `action-${index}`, changed_by: null, changes: { secret: 'synthetic-not-for-display' }, created_at: health.timestamp })) satisfies components['schemas']['AuditEventList']
    return route.fulfill({ json: rows })
  })
  await page.goto('/admin/ui/audit')
  await expect(page.locator('tbody tr')).toHaveCount(25)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Recent events').selectOption('25')
  await expect(page.getByText('Page 1 of 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()
  await expect(page.getByText('synthetic-not-for-display')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'deleted-entity' })).toHaveCount(0)
  expect(limits.every(limit => limit >= 1 && limit <= 200)).toBe(true)
  verify()
})