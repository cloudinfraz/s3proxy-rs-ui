import { expect, test, type Page } from '@playwright/test'
import { collections, mockControlApi } from './control-fixtures'
import type { components } from '../src/api/schema'

type Identity = components['schemas']['IdentityProjection']
const backendId = '00000000-0000-4000-8000-000000000001'
const record = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text }).or(page.locator('dl').filter({ hasText: text }))

async function directFixture(page: Page) {
  const verifyControl = await mockControlApi(page)
  const denied: string[] = []
  const mutations: Array<{ method: string; path: string; body: unknown }> = []
  let rows: Identity[] = [
    { ...collections['/admin/ui/identities'].items[0], virtual_bucket_count: 0 },
    { ...collections['/admin/ui/identities'].items[0], credential_id: '00000000-0000-4000-8000-000000000002', s3_access_key: 'virtual-access', access_mode: 'virtual' },
    { ...collections['/admin/ui/identities'].items[0], credential_id: '00000000-0000-4000-8000-000000000003', s3_access_key: 'disabled-direct', enabled: false, virtual_bucket_count: 0 },
  ]
  const failure = { update: false, remove: false }
  await page.route('**/*', async route => {
    const request = route.request()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    if (url.origin !== new URL(page.url()).origin) {
      denied.push(`${method} external request`)
      return route.abort()
    }
    if (method === 'GET' && path === '/admin/ui/identities') return route.fulfill({ json: { count: rows.length, items: rows } })
    if (method === 'GET' && path === '/admin/ui/identity-pages') return route.fulfill({ json: { items: rows.filter(identity => url.searchParams.get('access_mode') !== 'direct' || identity.access_mode === 'direct'), next_after_id: null, default_page_size: 100, max_page_size: 200 } satisfies components['schemas']['IdentityProjectionPage'] })
    if (method === 'POST' && path === '/admin/credentials') {
      const body = request.postDataJSON() as components['schemas']['CreateCredentialRequest']
      mutations.push({ method, path, body })
      const created: Identity = { ...rows[0], credential_id: '00000000-0000-4000-8000-000000000004', s3_access_key: 'created-direct', azure_account: body.azure_account, access_mode: body.access_mode, default_backend_id: body.default_backend_id ?? null, versioning_enabled: body.versioning_enabled ?? false, policy_attachment_count: 0 }
      rows = [...rows, created]
      return route.fulfill({ status: 201, json: { credential_id: created.credential_id, s3_access_key: created.s3_access_key, s3_secret_key: 'synthetic-direct-secret', s3_endpoint: 'https://synthetic.invalid', azure_account: created.azure_account, access_mode: created.access_mode, use_managed_identity: true, default_backend_id: created.default_backend_id } satisfies components['schemas']['CredentialCreatedResponse'] })
    }
    if (path === '/admin/credentials/fixture-access' && ['PUT', 'DELETE'].includes(method)) {
      const body = method === 'PUT' ? request.postDataJSON() as components['schemas']['UpdateCredentialRequest'] : null
      mutations.push({ method, path, body })
      if ((method === 'PUT' && failure.update) || (method === 'DELETE' && failure.remove)) return route.fulfill({ status: 503, contentType: 'application/xml', body: '<Error><Code>ServiceUnavailable</Code><Message>Synthetic failure</Message></Error>' })
      if (method === 'DELETE') {
        rows = rows.filter(identity => identity.s3_access_key !== 'fixture-access')
        return route.fulfill({ status: 204 })
      }
      rows = rows.map(identity => identity.s3_access_key === 'fixture-access' ? { ...identity, azure_account: body?.azure_account ?? identity.azure_account, enabled: body?.enabled ?? identity.enabled, versioning_enabled: body?.versioning_enabled ?? identity.versioning_enabled, default_backend_id: body?.default_backend_id ?? identity.default_backend_id } : identity)
      const updated = rows.find(identity => identity.s3_access_key === 'fixture-access')!
      return route.fulfill({ json: { credential_id: updated.credential_id, s3_access_key: updated.s3_access_key, azure_account: updated.azure_account, access_mode: updated.access_mode, use_managed_identity: updated.use_managed_identity, versioning_enabled: updated.versioning_enabled, default_backend_id: updated.default_backend_id, credential_scope: null } satisfies components['schemas']['CredentialDetail'] })
    }
    if (method === 'GET' && ['/admin/session', '/admin/capabilities', '/admin/ui/backends'].includes(path)) return route.fallback()
    denied.push(`${method} ${path}`)
    return route.abort()
  })
  return { mutations, failure, rows: () => rows, verify: () => { expect(denied).toEqual([]); verifyControl() } }
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  if (await dialog.count()) expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
}

test('direct metadata list and creation exclude virtual mode and storage requests', async ({ page }, testInfo) => {
  const fixture = await directFixture(page)
  await page.goto('/admin/ui/credentials?mode=direct')
  await expect(page.getByRole('heading', { name: 'Direct mappings', exact: true })).toBeVisible()
  await expect(record(page, 'fixture-access')).toBeVisible()
  await expect(record(page, 'disabled-direct')).toBeVisible()
  await expect(record(page, 'virtual-access')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Rotate|Replace/ })).toHaveCount(0)
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('direct-list.png'), fullPage: true })
  await page.getByRole('button', { name: 'Add direct mapping', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Mode', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('S3 bucket', { exact: true })).toHaveCount(0)
  await page.getByLabel('Azure account', { exact: true }).fill('createdaccount')
  await page.getByRole('combobox', { name: 'Default backend', exact: true }).selectOption(backendId)
  await page.getByRole('button', { name: 'Add mapping', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('synthetic-direct-secret')
  await page.getByRole('button', { name: 'I have stored this securely', exact: true }).click()
  await expect(record(page, 'created-direct')).toBeVisible()
  expect(fixture.mutations).toEqual([{ method: 'POST', path: '/admin/credentials', body: { s3_access_key: '', s3_secret_key: '', azure_account: 'createdaccount', use_managed_identity: true, access_mode: 'direct', versioning_enabled: false, default_backend_id: backendId } }])
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  fixture.verify()
})

test('direct configuration and removal preserve failed state and other identities', async ({ page }, testInfo) => {
  const fixture = await directFixture(page)
  await page.goto('/admin/ui/credentials')
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('direct')
  await page.getByRole('button', { name: 'Edit fixture-access', exact: true }).click()
  await page.getByLabel('Azure account', { exact: true }).fill('updatedaccount')
  await page.getByRole('combobox', { name: 'Default backend', exact: true }).selectOption(backendId)
  fixture.failure.update = true
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  expect(fixture.rows()[0].azure_account).toBe('fixtureaccount')
  await expect(page.getByLabel('Azure account', { exact: true })).toHaveValue('updatedaccount')
  fixture.failure.update = false
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  await expect(record(page, 'fixture-access')).toContainText('updatedaccount')
  expect(fixture.mutations.slice(0, 2)).toEqual(Array.from({ length: 2 }, () => ({ method: 'PUT', path: '/admin/credentials/fixture-access', body: { enabled: true, versioning_enabled: false, default_backend_id: backendId, azure_account: 'updatedaccount' } })))
  await page.getByRole('button', { name: 'Delete fixture-access', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('Revokes this S3 identity')
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('containers, blobs and native versions are retained')
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('direct-removal.png'), fullPage: true })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(fixture.mutations).toHaveLength(2)
  await page.getByRole('button', { name: 'Delete fixture-access', exact: true }).click()
  fixture.failure.remove = true
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove fixture-access', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  expect(fixture.rows().some(identity => identity.s3_access_key === 'fixture-access')).toBe(true)
  fixture.failure.remove = false
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove fixture-access', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  await expect(record(page, 'fixture-access')).toHaveCount(0)
  await expect(record(page, 'disabled-direct')).toBeVisible()
  expect(fixture.rows().some(identity => identity.s3_access_key === 'virtual-access')).toBe(true)
  expect(fixture.mutations.slice(2)).toEqual(Array.from({ length: 2 }, () => ({ method: 'DELETE', path: '/admin/credentials/fixture-access', body: null })))
  fixture.verify()
})