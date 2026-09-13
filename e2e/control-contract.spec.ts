import { expect, test } from '@playwright/test'
import { health, mockControlApi, navigateTo, readiness } from './control-fixtures'

test('UI068-01 typed collections render rows and overview counts', async ({ page }) => {
  const verifyRequests = await mockControlApi(page)
  await page.goto('/admin/ui/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.locator('.metric strong')).toHaveText(['1', '1', '1', '1'])
  for (const [label, value] of [
    ['S3 identities', 'fixture-access'], ['Policies', 'fixture-policy'],
    ['Azure backends', 'fixture-backend'], ['Bucket routing', 'fixture-bucket'],
    ['Admin keys', 'fixture-admin'],
  ]) {
    await navigateTo(page, label)
    await expect(page.getByText(value, { exact: true })).toBeVisible()
    await expect(page.locator('tbody tr, .mobile-records > dl')).toHaveCount(1)
  }
  verifyRequests()
})

test('UI068-02 empty envelopes and arrays show zero counts and empty tables', async ({ page }) => {
  const verifyRequests = await mockControlApi(page, true)
  await page.goto('/admin/ui/')
  await expect(page.locator('.metric strong')).toHaveText(['0', '0', '0', '0'])
  for (const label of ['S3 identities', 'Policies', 'Azure backends', 'Bucket routing', 'Admin keys']) {
    await navigateTo(page, label)
    await expect(page.getByText('No records', { exact: true })).toBeVisible()
    await expect(page.locator('tbody tr, .mobile-records > dl')).toHaveCount(0)
  }
  verifyRequests()
})

test('UI068-02 failed collection reads show an error and recover on reload', async ({ page }) => {
  const verifyRequests = await mockControlApi(page)
  await page.route('**/admin/ui/identity-pages?*', route => route.fulfill({ status: 503, json: { message: 'Control service unavailable' } }))
  await page.goto('/admin/ui/credentials')
  await expect(page.getByText('The control service is temporarily unavailable. Retry the request.', { exact: true })).toBeVisible()
  await expect(page.getByText('No records', { exact: true })).toHaveCount(0)
  await page.unroute('**/admin/ui/identity-pages?*')
  await page.reload()
  await expect(page.getByText('fixture-access', { exact: true })).toBeVisible()
  await expect(page.getByText('Control service unavailable', { exact: true })).toHaveCount(0)
  verifyRequests()
})

test('UI068-06 malformed envelopes fail visibly instead of appearing empty', async ({ page }) => {
  await mockControlApi(page)
  await page.route('**/admin/ui/identity-pages?*', route => route.fulfill({ json: { next_after_id: null } }))
  await page.goto('/admin/ui/credentials')
  await expect(page.getByText('The control service returned an invalid response.', { exact: true })).toBeVisible()
  await expect(page.getByText('No records', { exact: true })).toHaveCount(0)
  await page.unroute('**/admin/ui/identity-pages?*')
  await page.reload()
  await expect(page.getByText('fixture-access', { exact: true })).toBeVisible()
})

test('UI068-07 overview and identity selectors never request the unbounded inventory', async ({ page }) => {
  const identityReads: string[] = []
  page.on('request', request => {
    if (!['fetch', 'xhr'].includes(request.resourceType())) return
    const path = new URL(request.url()).pathname
    if (path === '/admin/ui/identities' || path === '/admin/ui/identity-pages') identityReads.push(path)
  })
  const verifyRequests = await mockControlApi(page)

  await page.goto('/admin/ui/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(identityReads).toEqual([])

  identityReads.length = 0
  await page.goto('/admin/ui/buckets')
  await expect(page.getByRole('heading', { name: 'Bucket routing' })).toBeVisible()
  await expect.poll(() => identityReads).toContain('/admin/ui/identity-pages')
  expect(identityReads).not.toContain('/admin/ui/identities')

  identityReads.length = 0
  await navigateTo(page, 'Policies')
  await page.getByRole('tab', { name: 'Identity attachments' }).click()
  await expect(page.getByRole('region', { name: 'Identity attachments' }).getByRole('combobox', { name: 'Identity', exact: true })).toBeVisible()
  await expect.poll(() => identityReads).toContain('/admin/ui/identity-pages')
  expect(identityReads).not.toContain('/admin/ui/identities')
  await page.getByRole('tab', { name: 'Diagnostics' }).click()
  await expect(page.getByRole('region', { name: 'Identity policy simulator' })).toBeVisible()
  expect(identityReads).not.toContain('/admin/ui/identities')

  identityReads.length = 0
  await page.goto('/admin/ui/')
  await navigateTo(page, 'IAM roles')
  await page.getByRole('button', { name: 'Create role', exact: true }).click()
  await expect(page.getByLabel('Resource owner')).toBeVisible()
  await expect.poll(() => identityReads).toContain('/admin/ui/identity-pages')
  expect(identityReads).not.toContain('/admin/ui/identities')
  verifyRequests()
})

test('UI072-01 overview renders backend diagnostics without inventory traversal and retains stale findings', async ({ page }) => {
  const requests: string[] = []
  let readinessReads = 0
  page.on('request', request => {
    if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(new URL(request.url()).pathname)
  })
  await mockControlApi(page)
  await page.route('**/admin/ui/readiness?*', route => {
    readinessReads += 1
    if (readinessReads > 1) return route.fulfill({ status: 503, body: 'Unavailable' })
    return route.fulfill({ json: {
      ...readiness,
      status: 'attention',
      finding_count: 4,
      items: [{
        key: '0123456789abcdef0123456789abcdef',
        code: 'backend_unsupported_auth_mode',
        severity: 'warning',
        resource_kind: 'backend',
        resource_id: '00000000-0000-4000-8000-000000000001',
        display_name: 'archive',
        affected_count: 3,
      }],
    } })
  })
  await page.goto('/admin/ui/')

  await expect(page.getByText('Needs attention')).toBeVisible()
  await expect(page.getByText('Backend archive uses an authentication mode unavailable to this deployment. 3 resources are affected.')).toBeVisible()
  await expect(page.getByText('Showing 1 of 4 findings')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/admin/ui/azure-backends')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(100)
  expect(requests.filter(path => path === '/admin/ui/readiness')).toHaveLength(1)
  await page.getByRole('button', { name: 'Refresh configuration diagnostics' }).click()
  await expect(page.getByRole('alert')).toContainText(`Refresh failed; showing diagnostics from ${readiness.evaluated_at}.`)
  await expect(page.getByText('Backend archive uses an authentication mode unavailable to this deployment. 3 resources are affected.')).toBeVisible()

  expect(requests).toContain('/admin/ui/overview')
  expect(requests).toContain('/admin/ui/readiness')
  expect(requests).toContain('/admin/health')
  for (const forbidden of ['/admin/ui/identities', '/admin/ui/identity-pages', '/admin/ui/virtual-buckets', '/admin/ui/backends', '/admin/api-keys', '/admin/ui/roles']) {
    expect(requests).not.toContain(forbidden)
  }
  expect(requests.filter(path => path === '/admin/ui/readiness')).toHaveLength(3)
  expect(health.status).toBe('healthy')
})

test('UI072-02 overview pages through all configuration findings with opaque cursors', async ({ page }) => {
  const inventoryReads: string[] = []
  const cursors: Array<string | null> = []
  page.on('request', request => {
    if (!['fetch', 'xhr'].includes(request.resourceType())) return
    const path = new URL(request.url()).pathname
    if (['/admin/ui/identities', '/admin/ui/identity-pages', '/admin/ui/virtual-buckets', '/admin/ui/backends', '/admin/api-keys', '/admin/ui/roles'].includes(path)) inventoryReads.push(path)
  })
  await mockControlApi(page)
  await page.route('**/admin/ui/readiness?*', route => {
    const cursor = new URL(route.request().url()).searchParams.get('after_key')
    cursors.push(cursor)
    const offset = cursor === 'page-2' ? 20 : 0
    const items = Array.from({ length: 20 }, (_, index) => ({
      key: (offset + index + 1).toString(16).padStart(32, '0'),
      code: 'identity_no_enabled_mapping',
      severity: 'warning',
      resource_kind: 'identity',
      resource_id: `00000000-0000-4000-8000-${(offset + index + 1).toString().padStart(12, '0')}`,
      display_name: null,
      affected_count: null,
    }))
    return route.fulfill({ json: {
      ...readiness,
      status: 'attention',
      finding_count: 222,
      items,
      next_after_key: cursor === 'page-2' ? 'page-3' : 'page-2',
    } })
  })
  await page.goto('/admin/ui/')

  await expect(page.getByText('Showing 1-20 of 222 findings')).toBeVisible()
  await expect(page.getByLabel('Configuration findings pagination')).toContainText('Page 1 of 12')
  await page.getByRole('button', { name: 'Next configuration findings page' }).click()
  await expect(page.getByText('Showing 21-40 of 222 findings')).toBeVisible()
  await expect(page.getByLabel('Configuration findings pagination')).toContainText('Page 2 of 12')
  await page.getByRole('button', { name: 'Previous configuration findings page' }).click()
  await expect(page.getByText('Showing 1-20 of 222 findings')).toBeVisible()

  expect(cursors).toEqual([null, 'page-2'])
  expect(inventoryReads).toEqual([])
})