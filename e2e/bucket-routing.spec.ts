import { expect, test, type Page } from '@playwright/test'
import type { components } from '../src/api/schema'
import { capabilities, collections, mockControlApi } from './control-fixtures'

test('UI072-04 direct details are read-only and fail closed for unavailable routing metadata', async ({ page }, testInfo) => {
  const verify = await mockControlApi(page)
  const denied: string[] = []
  const backend = collections['/admin/ui/backends'].items[0]
  let scenario = 'default'
  await page.route('**/*', async route => {
    const request = route.request()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback()
    const url = new URL(request.url())
    const path = url.pathname
    if (url.origin !== new URL(page.url()).origin || request.method() !== 'GET') {
      denied.push('non-read or external request'); return route.abort()
    }
    if (path === '/admin/ui/identities') return route.fulfill({ json: { count: 1, items: [{ ...collections['/admin/ui/identities'].items[0], default_backend_id: scenario === 'legacy' ? null : backend.id }] } })
    if (path === '/admin/capabilities') {
      if (scenario === 'capability-error') return route.fulfill({ status: 503, body: 'Unavailable' })
      return route.fulfill({ json: { ...capabilities, backend_routing_enabled: scenario !== 'gate-off', public_s3_endpoint: scenario === 'unsafe-endpoint' ? 'https://user:synthetic@example.test?sig=synthetic' : 'https://public-s3.example.test' } })
    }
    if (path === '/admin/ui/backends') {
      if (scenario === 'backend-error') return route.fulfill({ status: 503, body: 'Unavailable' })
      return route.fulfill({ json: { count: scenario === 'missing' ? 0 : 1, items: scenario === 'missing' ? [] : [{ ...backend, azure_account: 'selectedaccount', enabled: scenario !== 'disabled', auth_mode: scenario === 'unsupported' ? 'sas_token' : 'managed_identity' }] } })
    }
    if (path === '/admin/session') return route.fallback()
    denied.push(path); return route.abort()
  })
  const states = [
    ['default', 'selectedaccount', 'Configured'],
    ['missing', 'Unavailable', 'Selected backend missing'],
    ['disabled', 'selectedaccount', 'Selected backend disabled'],
    ['unsupported', 'selectedaccount', 'Selected backend authentication unavailable'],
    ['backend-error', 'Unavailable', 'Backend metadata unavailable'],
    ['capability-error', 'Unavailable', 'Runtime capabilities unavailable'],
    ['gate-off', 'fixtureaccount', 'Configured'],
    ['legacy', 'fixtureaccount', 'Configured'],
    ['unsafe-endpoint', 'selectedaccount', 'Configured'],
  ]
  for (const [mode, account, state] of states) {
    scenario = mode
    await page.goto('/admin/ui/credentials?mode=direct')
    await page.getByRole('button', { name: 'View fixture-access', exact: true }).click()
    const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
    const value = (label: string) => dialog.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('+ dd')
    await expect(value('Effective Azure account')).toHaveText(account)
    await expect(value('Routing state')).toHaveText(state)
    await expect(dialog.locator('input, select, textarea')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: /Save|Remove|Confirm|Create/ })).toHaveCount(0)
    if (!['legacy', 'gate-off'].includes(mode)) await expect(dialog).not.toContainText('fixtureaccount')
    if (mode === 'default') {
      await dialog.getByText('List request examples', { exact: true }).click()
      await expect(dialog.locator('pre')).toHaveCount(3)
      await expect(dialog).toContainText('forcePathStyle: true')
      await expect(dialog).toContainText('addressing_style = path')
      await expect(dialog).toContainText('https://public-s3.example.test')
      await expect(dialog.locator('pre')).not.toContainText([/no-sign|no-verify|secretAccessKey|DeleteBucket|CreateBucket/])
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      expect(await dialog.evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= window.innerHeight })).toBe(true)
      await dialog.evaluate(element => { element.scrollTop = 0 })
      await page.screenshot({ path: testInfo.outputPath('direct-details.png'), fullPage: true })
      await dialog.getByRole('heading', { name: 'JavaScript', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath('direct-details-examples.png'), fullPage: true })
    }
    if (['unsafe-endpoint', 'capability-error'].includes(mode)) {
      await expect(value('Public S3 endpoint')).toHaveText('Unavailable')
      await expect(dialog.getByText('List request examples', { exact: true })).toHaveCount(0)
      await expect(dialog).not.toContainText('synthetic')
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  expect(denied).toEqual([])
  verify()
})

type Mapping = components['schemas']['AdminVirtualMapping']
const ownerId = collections['/admin/virtual-buckets'][0].credential_id
const secondOwnerId = '00000000-0000-4000-8000-000000000002'
const selectedBackend = '00000000-0000-4000-8000-000000000003'

async function mappingFixture(page: Page, empty = false) {
  const verifyControl = await mockControlApi(page)
  const requests: Array<{ method: string; body: unknown; id?: string }> = []
  const denied: string[] = []
  let token = 1
  const nextToken = () => (token++).toString(16).padStart(32, '0')
  const initial: Mapping = { ...collections['/admin/ui/virtual-buckets'].items[0], credential_default_backend_id: ownerId, impact_token: nextToken() }
  let rows: Mapping[] = empty ? [] : [initial, { ...initial, id: secondOwnerId, credential_id: secondOwnerId, impact_token: nextToken() }]
  const flags = { conflict: false, removalFailure: false, backendDisabled: false }
  await page.route('**/*', async route => {
    const request = route.request()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback()
    const url = new URL(request.url())
    const method = request.method()
    const path = url.pathname
    if (url.origin !== new URL(page.url()).origin) { denied.push('external'); return route.abort() }
    if (path === '/admin/ui/identities' && method === 'GET') return route.fulfill({ json: { count: 3, items: [
      { ...collections['/admin/ui/identities'].items[0], access_mode: 'virtual', default_backend_id: ownerId },
      { ...collections['/admin/ui/identities'].items[0], access_mode: 'virtual', credential_id: secondOwnerId, s3_access_key: 'second-owner', default_backend_id: ownerId },
      { ...collections['/admin/ui/identities'].items[0], credential_id: selectedBackend, s3_access_key: 'direct-owner' },
    ] } })
    if (path === '/admin/ui/backends' && method === 'GET') return route.fulfill({ json: { count: 2, items: [collections['/admin/ui/backends'].items[0], { ...collections['/admin/ui/backends'].items[0], id: selectedBackend, name: 'second-backend', azure_account: 'otheraccount' }] } })
    if (path === `/admin/ui/mapping-backends/${selectedBackend}` && method === 'GET') return route.fulfill({ json: { id: selectedBackend, azure_account: 'otheraccount', auth_mode: 'managed_identity', enabled: !flags.backendDisabled, revision: 7 } })
    if (path === '/admin/ui/virtual-buckets' && method === 'GET') return route.fulfill({ json: { items: rows, next_after_id: null } })
    if (path === '/admin/ui/virtual-buckets' && method === 'POST') {
      const body = request.postDataJSON() as components['schemas']['CreateVirtualMapping']
      requests.push({ method, body })
      const created: Mapping = { ...initial, ...body, id: selectedBackend, backend_id: body.backend_id ?? null, endpoint_prefix: body.endpoint_prefix ?? null, impact_token: nextToken() }
      rows.push(created)
      return route.fulfill({ status: 201, json: created })
    }
    const id = path.startsWith('/admin/ui/virtual-buckets/') ? path.split('/').at(-1) : undefined
    const mapping = rows.find(row => row.id === id)
    if (mapping && method === 'GET') return route.fulfill({ json: mapping })
    if (mapping && (method === 'PUT' || method === 'DELETE')) {
      const body = request.postDataJSON() as components['schemas']['UpdateVirtualMapping']
      requests.push({ method, body, id })
      if (flags.conflict || body.expected_impact_token !== mapping.impact_token) {
        flags.conflict = false; mapping.impact_token = nextToken()
        return route.fulfill({ status: 409, contentType: 'application/xml', body: '<Error><Code>Conflict</Code><Message>Routing metadata changed</Message></Error>' })
      }
      if (method === 'DELETE') {
        if (flags.removalFailure) return route.fulfill({ status: 503, contentType: 'application/xml', body: '<Error><Code>ServiceUnavailable</Code><Message>Synthetic failure</Message></Error>' })
        rows = rows.filter(row => row.id !== id)
        return route.fulfill({ status: 204 })
      }
      Object.assign(mapping, body, { impact_token: nextToken() })
      return route.fulfill({ json: mapping })
    }
    if (method === 'GET' && ['/admin/session', '/admin/capabilities'].includes(path)) return route.fallback()
    denied.push(`${method} ${path}`); return route.abort()
  })
  return { requests, flags, rows: () => rows, verify: () => { verifyControl(); expect(denied).toEqual([]) } }
}

test('UI077-01 generates a virtual identity then creates and updates its bucket mapping', async ({ page }) => {
  const verifyControl = await mockControlApi(page, true)
  const credentialId = '00000000-0000-4000-8000-000000000099'
  const mappingId = '00000000-0000-4000-8000-000000000098'
  const secret = 'synthetic-ui077-one-time-secret'
  const timestamp = '2026-09-08T00:00:00Z'
  const credentialRequests: components['schemas']['CreateCredentialRequest'][] = []
  const mappingRequests: Array<components['schemas']['CreateVirtualMapping'] | components['schemas']['UpdateVirtualMapping']> = []
  let identity: components['schemas']['IdentityProjection'] | null = null
  let mapping: Mapping | null = null
  await page.route('**/*', async route => {
    const request = route.request()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path === '/admin/ui/identities' && method === 'GET') return route.fulfill({ json: { count: identity ? 1 : 0, items: identity ? [identity] : [] } })
    if (path === '/admin/ui/virtual-buckets' && method === 'GET') return route.fulfill({ json: { items: mapping ? [mapping] : [], next_after_id: null } })
    if (path === '/admin/credentials' && method === 'POST') {
      credentialRequests.push(request.postDataJSON())
      identity = {
        credential_id: credentialId, s3_access_key: 'generated-ui077-access', azure_account: 'workflowaccount', access_mode: 'virtual',
        use_managed_identity: true, versioning_enabled: false, default_backend_id: null, enabled: true, virtual_bucket_count: 0, policy_attachment_count: 0,
      }
      return route.fulfill({ status: 201, json: {
        credential_id: credentialId, s3_access_key: identity.s3_access_key, s3_secret_key: secret, s3_endpoint: 'https://s3.example.test',
        azure_account: identity.azure_account, access_mode: identity.access_mode, use_managed_identity: true, default_backend_id: null,
      } satisfies components['schemas']['CredentialCreatedResponse'] })
    }
    if (path === '/admin/ui/virtual-buckets' && method === 'POST') {
      const body = request.postDataJSON() as components['schemas']['CreateVirtualMapping']
      mappingRequests.push(body)
      mapping = { ...body, id: mappingId, backend_id: body.backend_id ?? null, endpoint_prefix: body.endpoint_prefix ?? null, enabled: true, credential_default_backend_id: null, impact_token: '11111111111111111111111111111111', created_at: timestamp, updated_at: timestamp }
      return route.fulfill({ status: 201, json: mapping })
    }
    if (path === `/admin/ui/virtual-buckets/${mappingId}` && mapping && method === 'GET') return route.fulfill({ json: mapping })
    if (path === `/admin/ui/virtual-buckets/${mappingId}` && mapping && method === 'PUT') {
      const body = request.postDataJSON() as components['schemas']['UpdateVirtualMapping']
      mappingRequests.push(body)
      mapping = { ...mapping, ...body, impact_token: '22222222222222222222222222222222', updated_at: timestamp }
      return route.fulfill({ json: mapping })
    }
    return route.fallback()
  })

  await page.goto('/admin/ui/buckets')
  await page.getByRole('link', { name: 'Create virtual identity', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Create S3 identity' })).toBeVisible()
  await expect(page.getByLabel('Mode')).toHaveValue('virtual')
  await page.getByLabel('Azure account').fill('workflowaccount')
  await page.getByRole('button', { name: 'Create identity', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toContainText(secret)
  await page.getByRole('button', { name: 'I stored these securely; continue', exact: true }).click()

  await expect(page.getByRole('dialog', { name: 'Add bucket routing' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Identity', exact: true })).toHaveValue(credentialId)
  expect(page.url()).not.toContain(secret)
  const browserState = await page.evaluate(() => ({ local: Object.entries(localStorage), session: Object.entries(sessionStorage), body: document.body.textContent }))
  expect(browserState.local).toEqual([])
  expect(browserState.session).toEqual([])
  expect(JSON.stringify(browserState)).not.toContain(secret)
  await page.getByLabel('S3 bucket', { exact: true }).fill('workflow-bucket')
  await page.getByLabel('Azure container', { exact: true }).fill('workflow-container')
  await page.getByRole('button', { name: 'Review changes', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(page.getByText('workflow-bucket', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Edit workflow-bucket', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('changing ownership requires a new mapping.')
  await expect(page.getByRole('combobox', { name: 'Identity', exact: true })).toBeDisabled()
  await page.getByLabel('Azure container', { exact: true }).fill('updated-container')
  await page.getByRole('button', { name: 'Review changes', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm change', exact: true }).click()

  expect(credentialRequests).toEqual([{ s3_access_key: '', s3_secret_key: '', azure_account: 'workflowaccount', use_managed_identity: true, access_mode: 'virtual', versioning_enabled: false, default_backend_id: null }])
  expect(mappingRequests).toEqual([
    { virtual_bucket_name: 'workflow-bucket', azure_container: 'workflow-container', credential_id: credentialId, backend_id: null, endpoint_prefix: null },
    { expected_impact_token: '11111111111111111111111111111111', azure_container: 'updated-container' },
  ])
  expect(JSON.stringify(mappingRequests)).not.toContain(secret)
  verifyControl()
})

test('UI072-05 dotted aliases stay local and a corrected alias submits unchanged', async ({ page }, testInfo) => {
  const fixture = await mappingFixture(page, true)
  await page.goto('/admin/ui/buckets')
  await page.getByRole('button', { name: 'Add bucket routing', exact: true }).click()
  await page.getByLabel('S3 bucket', { exact: true }).fill('my.bucket.name')
  await page.getByLabel('Azure container', { exact: true }).fill('physical-container')
  await page.getByRole('combobox', { name: 'Identity', exact: true }).selectOption(ownerId)
  await page.getByRole('button', { name: 'Review changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Periods are not allowed.')
  await expect(page.getByLabel('S3 bucket', { exact: true })).toHaveValue('my.bucket.name')
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeEnabled()
  expect(fixture.requests).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('alias-validation.png'), fullPage: true })

  await page.getByLabel('S3 bucket', { exact: true }).fill('reports-new')
  await page.getByRole('button', { name: 'Review changes', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('reports-new', { exact: true })).toBeVisible()
  await expect(page.getByText('physical-container', { exact: true })).toBeVisible()
  expect(fixture.requests).toEqual([{ method: 'POST', body: {
    virtual_bucket_name: 'reports-new',
    azure_container: 'physical-container',
    credential_id: ownerId,
    backend_id: null,
    endpoint_prefix: null,
  } }])
  fixture.verify()
})

test('UI072-01 remaps, inherits and toggles only the selected owned mapping', async ({ page }, testInfo) => {
  const fixture = await mappingFixture(page)
  await page.goto('/admin/ui/buckets')
  await page.getByRole('button', { name: 'Edit fixture-bucket', exact: true }).first().click()
  await expect(page.getByLabel('S3 bucket', { exact: true })).toHaveAttribute('readonly', '')
  await expect(page.getByRole('combobox', { name: 'Identity', exact: true })).toBeDisabled()
  await page.getByLabel('Azure container', { exact: true }).fill('remapped-container')
  await page.getByRole('combobox', { name: 'Backend override', exact: true }).selectOption(selectedBackend)
  await page.getByLabel('Endpoint prefix', { exact: true }).fill('reports')
  await page.getByRole('button', { name: 'Review changes', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('fixtureaccount / fixturecontainer')
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('otheraccount / remapped-container')
  expect(await page.getByRole('dialog').or(page.getByRole('alertdialog')).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mapping-review.png'), fullPage: true })
  await page.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  expect(fixture.requests[0]).toEqual({ method: 'PUT', id: ownerId, body: { expected_impact_token: '1'.padStart(32, '0'), azure_container: 'remapped-container', backend_id: selectedBackend, expected_backend_revision: 7, endpoint_prefix: 'reports' } })
  expect(fixture.rows()[1].azure_container).toBe('fixturecontainer')
  await page.getByRole('button', { name: 'Edit fixture-bucket', exact: true }).first().click()
  await page.getByRole('combobox', { name: 'Backend override', exact: true }).selectOption('')
  await page.getByLabel('Endpoint prefix', { exact: true }).fill('')
  await page.getByRole('checkbox', { name: 'Enabled', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Review changes', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  expect(fixture.requests[1].body).toMatchObject({ backend_id: null, endpoint_prefix: null, enabled: false })
  expect(fixture.requests[1].body).not.toHaveProperty('azure_container')
  await page.getByRole('button', { name: 'View fixture-bucket', exact: true }).first().click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('Identity default: fixtureaccount / remapped-container')
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('Disabled')
  fixture.verify()
})

test('UI072-02 unavailable selections and stale review cannot silently persist', async ({ page }) => {
  const fixture = await mappingFixture(page)
  await page.goto('/admin/ui/buckets')
  await page.getByRole('button', { name: 'Edit fixture-bucket', exact: true }).first().click()
  await page.getByRole('combobox', { name: 'Backend override', exact: true }).selectOption(selectedBackend)
  fixture.flags.backendDisabled = true
  await page.getByRole('button', { name: 'Review changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('unavailable')
  expect(fixture.requests).toEqual([])
  fixture.flags.backendDisabled = false
  await page.getByRole('button', { name: 'Review changes', exact: true }).click()
  fixture.flags.conflict = true
  await page.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('Mapping review expired')
  await expect(page.getByRole('button', { name: 'Confirm change', exact: true })).toHaveCount(0)
  expect(fixture.rows()[0].backend_id).toBeNull()
  await page.getByRole('button', { name: 'Reload and review', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Backend override', exact: true })).toHaveValue('')
  await page.getByLabel('Azure container', { exact: true }).fill('after-reload')
  await page.getByRole('button', { name: 'Review changes', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  expect(fixture.requests).toHaveLength(2)
  expect(fixture.rows()[0].azure_container).toBe('after-reload')
  fixture.verify()
})

test('UI072-03 cancelled and failed removal preserve the mapping and other owner', async ({ page }) => {
  const fixture = await mappingFixture(page)
  await page.goto('/admin/ui/buckets')
  await page.getByRole('button', { name: 'Remove fixture-bucket', exact: true }).first().click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('Azure containers, blobs and native versions are retained')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(fixture.requests).toEqual([])
  await page.getByRole('button', { name: 'Remove fixture-bucket', exact: true }).first().click()
  fixture.flags.removalFailure = true
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove fixture-bucket', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The control service is temporarily unavailable')
  expect(fixture.rows()).toHaveLength(2)
  fixture.flags.removalFailure = false
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove fixture-bucket', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  expect(fixture.rows()).toHaveLength(1)
  expect(fixture.rows()[0].credential_id).toBe(secondOwnerId)
  expect(fixture.requests[1]).toEqual(fixture.requests[0])
  fixture.verify()
})