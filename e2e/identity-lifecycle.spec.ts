import { expect, test } from '@playwright/test'
import { collections, mockControlApi, navigateTo } from './control-fixtures'
import type { components } from '../src/api/schema'

test('UI070-02 replacement reviews safe settings, validates and retries without changing the original', async ({ page }) => {
  const verify = await mockControlApi(page)
  const bodies: components['schemas']['CreateCredentialRequest'][] = []
  await page.route('**/admin/credentials', route => {
    bodies.push(route.request().postDataJSON())
    if (bodies.length === 1) return route.fulfill({ status: 503 })
    return route.fulfill({ status: 201, json: {
      credential_id: '00000000-0000-4000-8000-000000000002', s3_access_key: 'replacement-access',
      s3_secret_key: 'synthetic-replacement-secret', s3_endpoint: 'https://synthetic.invalid',
      azure_account: 'replacementaccount', access_mode: 'virtual', use_managed_identity: true,
      default_backend_id: null,
    } satisfies components['schemas']['CredentialCreatedResponse'] })
  })
  await page.goto('/admin/ui/credentials')
  await page.getByRole('button', { name: 'Replace fixture-access', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create replacement', exact: true })
  await expect(dialog.getByLabel('Azure account')).toHaveValue('fixtureaccount')
  await expect(dialog.getByLabel('Mode', { exact: true })).toHaveValue('direct')
  expect(bodies).toHaveLength(0)
  await dialog.getByLabel('Azure account').fill('INVALID')
  await dialog.getByRole('button', { name: 'Create replacement', exact: true }).click()
  expect(bodies).toHaveLength(0)
  await dialog.getByLabel('Azure account').fill('replacementaccount')
  await dialog.getByLabel('Mode', { exact: true }).selectOption('virtual')
  await dialog.getByLabel('Versioning enabled', { exact: true }).check()
  await dialog.getByRole('button', { name: 'Create replacement', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('HTTP 503')
  await expect(dialog.getByLabel('Azure account')).toHaveValue('replacementaccount')
  await expect(dialog.getByLabel('Mode', { exact: true })).toHaveValue('virtual')
  await dialog.getByRole('button', { name: 'Create replacement', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('synthetic-replacement-secret')
  await page.getByRole('button', { name: 'I have stored this securely' }).click()
  await expect(page.getByRole('button', { name: 'Edit fixture-access', exact: true })).toBeVisible()
  const expected = { s3_access_key: '', s3_secret_key: '', azure_account: 'replacementaccount',
    access_mode: 'virtual', use_managed_identity: true, versioning_enabled: true, default_backend_id: null }
  expect(bodies).toEqual([expected, expected])
  expect(await page.content()).not.toContain('synthetic-replacement-secret')
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  verify()
})

for (const mode of ['direct', 'virtual'] as const) {
  test(`UI070-02 ${mode} identity details hide stale metadata after failed refresh`, async ({ page }) => {
    const verify = await mockControlApi(page)
    let fail = false
    await page.route('**/admin/ui/identities', route => route.fulfill(fail ? { status: 503 } : { json: {
      count: 1, items: [{ ...collections['/admin/ui/identities'].items[0], access_mode: mode, policy_attachment_count: null }],
    } satisfies components['schemas']['IdentityProjectionListResponse'] }))
    await page.goto('/admin/ui/credentials')
    await page.getByRole('button', { name: 'View fixture-access', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Identity details', exact: true })
    await expect(dialog.getByText(mode, { exact: true })).toBeVisible()
    await expect(dialog.getByText('00000000-0000-4000-8000-000000000001', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Unavailable', { exact: true })).toBeVisible()
    fail = true
    await dialog.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('Identity metadata unavailable.')
    await expect(dialog.getByText('fixtureaccount', { exact: true })).toHaveCount(0)
    fail = false
    await dialog.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(dialog.getByText('fixtureaccount', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
    verify()
  })
}

for (const backendState of ['disabled', 'missing'] as const) {
  test(`UI070-02 edits preserve ${backendState} backend and unknown enabled metadata across failures`, async ({ page }) => {
    const verify = await mockControlApi(page)
    const backendId = '00000000-0000-4000-8000-000000000001'
    await page.route('**/admin/ui/identities', route => route.fulfill({ json: {
      count: 1, items: [{ ...collections['/admin/ui/identities'].items[0], default_backend_id: backendId, enabled: null }],
    } satisfies components['schemas']['IdentityProjectionListResponse'] }))
    await page.route('**/admin/ui/backends', route => route.fulfill({ json: {
      count: backendState === 'missing' ? 0 : 1,
      items: backendState === 'missing' ? [] : [{ ...collections['/admin/ui/backends'].items[0], enabled: false }],
    } satisfies components['schemas']['StorageBackendProjectionListResponse'] }))
    const updates: unknown[] = []
    let status = 400
    await page.route('**/admin/credentials/fixture-access', route => {
      expect(route.request().method()).toBe('PUT')
      updates.push(route.request().postDataJSON())
      return route.fulfill({ status })
    })
    await page.goto('/admin/ui/credentials')
    await page.getByRole('button', { name: 'Edit fixture-access', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit identity', exact: true })
    await expect(dialog.getByLabel('Default backend')).toHaveValue(backendId)
    await expect(dialog.getByLabel('Enabled state unavailable')).toBeDisabled()
    await dialog.getByLabel('Versioning enabled', { exact: true }).check()
    for (const failure of [400, 403, 404, 409, 503]) {
      status = failure
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(dialog.getByRole('alert')).toContainText(`HTTP ${failure}`)
      await expect(dialog.getByLabel('Versioning enabled', { exact: true })).toBeChecked()
      await expect(dialog.getByLabel('Default backend')).toHaveValue(backendId)
    }
    status = 204
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(updates).toEqual(Array.from({ length: 6 }, () => ({ versioning_enabled: true })))
    await page.getByRole('button', { name: 'Replace fixture-access', exact: true }).click()
    const replacement = page.getByRole('dialog', { name: 'Create replacement', exact: true })
    await expect(replacement.getByLabel('Default backend')).toHaveValue(backendId)
    await replacement.getByRole('button', { name: 'Create replacement', exact: true }).click()
    await expect(replacement.getByRole('alert')).toContainText('Select an enabled backend')
    await replacement.getByRole('button', { name: 'Cancel', exact: true }).click()
    verify()
  })
}

test('UI070-02 failed deletion retains the identity and allows an explicit retry', async ({ page }) => {
  const verify = await mockControlApi(page)
  let deleted = false
  let attempts = 0
  await page.route('**/admin/ui/identities', route => route.fulfill({ json: deleted
    ? { count: 0, items: [] } satisfies components['schemas']['IdentityProjectionListResponse']
    : collections['/admin/ui/identities'] }))
  await page.route('**/admin/credentials/fixture-access', route => {
    expect(route.request().method()).toBe('DELETE')
    attempts += 1
    deleted = attempts > 1
    return route.fulfill({ status: deleted ? 204 : 503 })
  })
  await page.goto('/admin/ui/credentials')
  await page.getByRole('button', { name: 'Delete fixture-access', exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete identity', exact: true })
  await expect(dialog).toContainText('Azure containers and blobs are retained.')
  await dialog.getByRole('button', { name: 'Delete fixture-access', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('HTTP 503')
  await expect(page.getByRole('button', { name: 'Edit fixture-access', exact: true, includeHidden: true })).toBeAttached()
  expect(attempts).toBe(1)
  await dialog.getByRole('button', { name: 'Delete fixture-access', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit fixture-access', exact: true })).toHaveCount(0)
  expect(attempts).toBe(2)
  verify()
})

test('UI070-03 logout rejects a late replacement secret response', async ({ page }) => {
  const verify = await mockControlApi(page)
  let release: () => void = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/admin/session', route => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 204 })
    : route.fulfill({ json: { authenticated: true, csrf_token: 'synthetic-csrf', expires_at: '2099-01-01T00:00:00Z' } satisfies components['schemas']['SessionResponse'] }))
  await page.route('**/admin/credentials', async route => {
    await held
    return route.fulfill({ status: 201, json: { credential_id: '00000000-0000-4000-8000-000000000002',
      s3_access_key: 'late-access', s3_secret_key: 'synthetic-logout-replacement-secret', s3_endpoint: 'https://synthetic.invalid',
      azure_account: 'fixtureaccount', access_mode: 'direct', use_managed_identity: true, default_backend_id: null,
    } satisfies components['schemas']['CredentialCreatedResponse'] })
  })
  await page.goto('/admin/ui/')
  await navigateTo(page, 'S3 identities')
  await page.getByRole('button', { name: 'Replace fixture-access', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Create replacement', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Creating...', exact: true })).toBeDisabled()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  const response = page.waitForResponse(reply => reply.url().endsWith('/admin/credentials'))
  release()
  await response
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.content()).not.toContain('synthetic-logout-replacement-secret')
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  verify()
})

test('UI070-01 creates and rotates identities without widening update payloads', async ({ page }) => {
  const verify = await mockControlApi(page)
  const requests: Array<{ path: string; body: unknown }> = []
  await page.route('**/admin/credentials', async route => {
    requests.push({ path: '/admin/credentials', body: route.request().postDataJSON() })
    return route.fulfill({ status: 201, json: { credential_id: '00000000-0000-4000-8000-000000000002', s3_access_key: 'created-access', s3_secret_key: 'synthetic-created-secret', s3_endpoint: 'https://synthetic.invalid', azure_account: 'createdaccount', access_mode: 'direct', use_managed_identity: true, default_backend_id: '00000000-0000-4000-8000-000000000001' } satisfies components['schemas']['CredentialCreatedResponse'] })
  })
  await page.route('**/admin/credentials/00000000-0000-4000-8000-000000000001/rotate-secret', route => {
    requests.push({ path: '/rotate-secret', body: route.request().postData() })
    return route.fulfill({ json: { credential_id: '00000000-0000-4000-8000-000000000001', s3_access_key: 'fixture-access', s3_secret_key: 'synthetic-rotated-secret' } satisfies components['schemas']['RotateCredentialSecretResponse'] })
  })

  await page.goto('/admin/ui/credentials')
  await expect(page.getByText('1 routes / 1 policies')).toBeVisible()
  await page.getByRole('button', { name: 'Create identity', exact: true }).click()
  await page.getByLabel('Azure account').fill('createdaccount')
  await page.getByLabel('Default backend').selectOption('00000000-0000-4000-8000-000000000001')
  await page.getByRole('button', { name: 'Create identity', exact: true }).last().click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('synthetic-created-secret')
  await page.getByRole('button', { name: 'I have stored this securely', exact: true }).click()
  await expect(page.getByText('synthetic-created-secret')).toHaveCount(0)

  await page.getByRole('button', { name: 'Rotate fixture-access' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rotate fixture-access', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('synthetic-rotated-secret')
  await page.getByRole('button', { name: 'I have stored this securely', exact: true }).click()
  expect(requests[0].body).toEqual({ s3_access_key: '', s3_secret_key: '', azure_account: 'createdaccount', use_managed_identity: true, access_mode: 'direct', versioning_enabled: false, default_backend_id: '00000000-0000-4000-8000-000000000001' })
  expect(requests[1]).toEqual({ path: '/rotate-secret', body: null })
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  verify()
})

test('UI070-03 delayed rotation cannot restore a dismissed secret', async ({ page }) => {
  const verify = await mockControlApi(page)
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/admin/credentials/00000000-0000-4000-8000-000000000001/rotate-secret', async route => {
    await gate
    return route.fulfill({ json: { credential_id: '00000000-0000-4000-8000-000000000001', s3_access_key: 'fixture-access', s3_secret_key: 'synthetic-late-identity-secret' } satisfies components['schemas']['RotateCredentialSecretResponse'] })
  })
  await page.goto('/admin/ui/')
  await navigateTo(page, 'S3 identities')
  await page.getByRole('button', { name: 'Rotate fixture-access' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rotate fixture-access', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Applying...', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  const response = page.waitForResponse(reply => reply.url().endsWith('/rotate-secret'))
  release()
  await response
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  await expect(page.getByText('synthetic-late-identity-secret')).toHaveCount(0)
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  verify()
})