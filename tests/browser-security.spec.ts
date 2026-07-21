import { expect, test } from '@playwright/test'

test('login and cookie mutation keep credential material out of browser storage', async ({ page }) => {
  let mutationCsrf: string | null = null
  const emptyLists = [
    '/admin/credentials', '/admin/virtual-buckets', '/admin/backends', '/admin/policies', '/admin/api-keys',
  ]

  await page.route('**/admin/session/login', async route => {
    const body = route.request().postDataJSON() as { api_key: string }
    expect(body.api_key).toBe('browser-test-admin-key')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'set-cookie': '__Host-s3proxy_session=opaque; Path=/; HttpOnly; Secure; SameSite=Strict' },
      body: JSON.stringify({ csrf_token: 'csrf-login', expires_at: '2026-07-22T00:00:00Z' }),
    })
  })
  await page.route('**/admin/session', async route => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, csrf_token: 'csrf-refresh', expires_at: '2026-07-22T00:00:00Z' }) })
  })
  await page.route('**/admin/health', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'healthy' }) }))
  for (const path of emptyLists) {
    await page.route(`**${path}`, async route => {
      if (path === '/admin/credentials' && route.request().method() === 'POST') {
        mutationCsrf = route.request().headers()['x-csrf-token'] ?? null
        return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
  }

  await page.goto('/admin/ui/login')
  await page.getByLabel('Admin API key').fill('browser-test-admin-key')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('link', { name: 'Credentials' }).click()
  await page.getByRole('button', { name: 'Add credentials' }).click()
  await page.getByLabel('S3 secret key').fill('never-store-this-secret')
  await page.getByLabel('Azure account').fill('testaccount')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => mutationCsrf).toBe('csrf-login')

  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    body: document.body.textContent,
  }))
  expect(storage.local).toEqual([])
  expect(storage.session).toEqual([])
  expect(storage.body).not.toContain('browser-test-admin-key')
  expect(storage.body).not.toContain('never-store-this-secret')
})
