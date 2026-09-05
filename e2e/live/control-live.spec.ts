import { devices, expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import type { components } from '../../src/api/schema'

let adminKey = ''
const keyName = `ui-live-${randomUUID()}`
const origin = 'http://127.0.0.1:4174'

function requireSuccess(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

test.beforeAll(async () => {
  requireSuccess(process.env.UI_E2E_DISPOSABLE === '1', 'Explicit disposable local UI E2E opt-in is required')
  const response = await fetch(`${origin}/admin/bootstrap/api-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key_name: keyName, created_by: 'ui-live-test' }),
  })
  requireSuccess(response.status === 200, 'Bootstrap requires a fresh disposable local database')
  const issued = await response.json() as components['schemas']['BootstrapAdminKeyResponse']
  requireSuccess(typeof issued.api_key === 'string' && issued.api_key.length > 0, 'Bootstrap did not issue a key')
  adminKey = issued.api_key
})

test.afterAll(async () => {
  if (!adminKey) return
  try {
    const response = await fetch(`${origin}/admin/api-keys/${encodeURIComponent(keyName)}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${adminKey}` },
    })
    requireSuccess(response.status === 204, 'Run-owned admin key cleanup failed')
  } finally {
    adminKey = ''
  }
})

for (const [viewport, device] of [['desktop', devices['Desktop Chrome']], ['mobile', devices['Pixel 7']]] as const) {
  test.describe(viewport, () => {
    test.use({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: device.deviceScaleFactor, userAgent: device.userAgent })
    test('UI068-LIVE real login, contract reads, validation errors and logout', async ({ page }) => {
      let stage = 'anonymous rejection'
      try {
        const anonymous = await fetch(`${origin}/admin/capabilities`)
        requireSuccess(anonymous.status === 403, 'Anonymous capabilities must be rejected')
        requireSuccess(anonymous.headers.get('content-type')?.startsWith('application/xml') === true, 'Authentication error must be XML')
        stage = 'browser login'
        await page.goto('/admin/ui/login')
        await page.getByLabel('Admin API key').fill(adminKey)
        const loginResponse = page.waitForResponse(response => response.url().endsWith('/admin/session/login') && response.request().method() === 'POST')
        await page.getByRole('button', { name: 'Continue' }).click()
        const loginStatus = (await loginResponse).status()
        const hasSessionCookie = (await page.context().cookies()).some(cookie => cookie.name === '__Host-s3proxy_session')
        stage = `browser login (HTTP ${loginStatus}, session cookie ${hasSessionCookie ? 'present' : 'absent'})`
        requireSuccess(loginStatus === 200 && hasSessionCookie, 'Login must establish a browser session')
        await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

        stage = 'live operations navigation'
        for (const title of ['Audit', 'Health', 'Admin keys', 'Overview']) {
          const menu = page.getByRole('button', { name: 'Open navigation' })
          if (await menu.isVisible()) await menu.click()
          await page.getByRole('navigation', { name: 'Control navigation' }).getByRole('link', { name: title, exact: true }).click()
          await expect(page.getByRole('dialog')).toHaveCount(0)
          await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
          requireSuccess(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Live operations layout overflowed')
        }

        stage = 'authenticated contract reads and logout'
        const result = await page.evaluate(async () => {
          const read = async (path: string) => {
            const response = await fetch(path)
            if (!response.ok) throw new Error('Authenticated read failed')
            return response.json()
          }
          const capabilities = await read('/admin/capabilities')
          const health = await read('/admin/health')
          const preflight = await read('/admin/policies/preflight')
          const credentials = await read('/admin/credentials')
          const policies = await read('/admin/policies')
          const keys = await read('/admin/api-keys')
          const session = await read('/admin/session')
          const invalid = await fetch('/admin/policies', {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrf_token }, body: '{}',
          })
          const denied = await fetch('/admin/policies', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
          })
          const logout = await fetch('/admin/session', {
            method: 'DELETE', headers: { 'x-csrf-token': session.csrf_token },
          })
          const revoked = await fetch('/admin/capabilities')
          return {
            capabilityKeys: Object.keys(capabilities).sort(),
            endpointsPresent: ['public_sts_endpoint', 'public_s3_endpoint'].every(key => key in capabilities && (capabilities[key] === null || typeof capabilities[key] === 'string')),
            healthTyped: typeof health.cache.available === 'boolean' && typeof health.credentials.count === 'number' && typeof health.authorization.resolver_ready === 'boolean' && typeof health.database?.schema_valid === 'boolean',
            preflightTyped: Array.isArray(preflight.items) && preflight.count === preflight.items.length && typeof preflight.limits.max_policy_bytes === 'number',
            collectionsTyped: Array.isArray(credentials.items) && credentials.count === credentials.items.length && Array.isArray(policies.items) && policies.count === policies.items.length && Array.isArray(keys) && keys.every(key => typeof key.status === 'string'),
            invalidStatus: invalid.status, invalidType: invalid.headers.get('content-type'),
            deniedStatus: denied.status, deniedType: denied.headers.get('content-type'),
            logoutStatus: logout.status, revokedStatus: revoked.status,
            storageEmpty: localStorage.length === 0 && sessionStorage.length === 0,
          }
        })
        stage = 'contract assertions'
        expect(result.capabilityKeys).toEqual(['assume_role_ready', 'authz_mode', 'backend_routing_enabled', 'iam_account_configured', 'iam_assume_role_enabled', 'legacy_routing_available', 'plane', 'public_s3_endpoint', 'public_sts_endpoint', 'sts_enabled', 'usable_registry_auth_modes'])
        requireSuccess(result.endpointsPresent && result.healthTyped && result.preflightTyped && result.collectionsTyped, 'Live contract fields did not match required shapes')
        requireSuccess(result.invalidStatus === 422 && result.invalidType?.startsWith('text/plain') === true, 'Extractor validation must return plain text 422')
        requireSuccess(result.deniedStatus === 403 && result.deniedType?.startsWith('application/xml') === true, 'Missing CSRF must return XML 403')
        requireSuccess(result.logoutStatus === 204 && result.revokedStatus === 403 && result.storageEmpty, 'Logout or browser storage safety failed')
        stage = 'revoked session navigation'
        const sessionCheck = page.waitForResponse(response => response.url().endsWith('/admin/session') && response.request().method() === 'GET')
        const refreshedPage = await page.reload()
        stage = `revoked session navigation (page HTTP ${refreshedPage?.status()})`
        requireSuccess(refreshedPage?.status() === 200, 'Overview must load on a full page reload')
        const sessionStatus = (await sessionCheck).status()
        stage = `revoked session navigation (session HTTP ${sessionStatus})`
        requireSuccess(sessionStatus === 403, 'Revoked session must be rejected after reload')
        await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      } catch {
        throw new Error(`Live control UI failed at ${stage}; secret-bearing diagnostics suppressed`)
      }
    })
  })
}