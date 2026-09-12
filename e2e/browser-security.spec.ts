import { expect, test } from '@playwright/test'
import { emptyCollections, mockControlApi } from './control-fixtures'

test('login and cookie mutation keep credential material out of browser storage', async ({ page }) => {
  const verifyRequests = await mockControlApi(page, true)
  let mutationCsrf: string | null = null
  const outboundRequests: string[] = []
  page.on('request', request => {
    outboundRequests.push(`${request.url()}\n${request.postData() ?? ''}`)
  })
  const emptyLists = [
    '/admin/credentials', '/admin/ui/identities', '/admin/ui/identity-pages', '/admin/ui/backend-options', '/admin/virtual-buckets', '/admin/backends', '/admin/policies', '/admin/api-keys',
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
  for (const path of emptyLists) {
    await page.route(`**${path}`, async route => {
      if (path === '/admin/credentials' && route.request().method() === 'POST') {
        mutationCsrf = route.request().headers()['x-csrf-token'] ?? null
        return route.fulfill({ status: 201, json: { credential_id: 'created-id', s3_access_key: 'generated-access', s3_secret_key: 'generated-one-time-secret', s3_endpoint: 'https://synthetic.invalid' } })
      }
      return route.fulfill({ status: 200, json: emptyCollections[path as keyof typeof emptyCollections] })
    })
  }

  await page.goto('/admin/ui/login')
  await page.getByLabel('Admin API key').fill('browser-test-admin-key')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Control navigation' }).getByRole('link', { name: 'S3 identities' }).click()
  await page.getByRole('button', { name: 'Create identity', exact: true }).click()
  await page.getByLabel('Azure account').fill('testaccount')
  await page.getByRole('button', { name: 'Create identity', exact: true }).last().click()
  await expect.poll(() => mutationCsrf).toBe('csrf-refresh')
  await expect(page.getByRole('dialog')).toContainText('generated-one-time-secret')
  await page.getByRole('button', { name: 'I have stored this securely', exact: true }).click()

  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    body: document.body.textContent,
  }))
  expect(storage.local).toEqual([])
  expect(storage.session).toEqual([])
  expect(storage.body).not.toContain('browser-test-admin-key')
  expect(storage.body).not.toContain('generated-one-time-secret')
  expect(page.url()).not.toContain('generated-access')
  expect(page.url()).not.toContain('generated-one-time-secret')
  expect(JSON.stringify(outboundRequests)).not.toContain('generated-access')
  expect(JSON.stringify(outboundRequests)).not.toContain('generated-one-time-secret')
  verifyRequests()
})
