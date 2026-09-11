import { expect, test } from '@playwright/test'
import type { components } from '../src/api/schema'
import { mockControlApi, navigateTo } from './control-fixtures'

const fixtureId = '00000000-0000-4000-8000-000000000001'
const selectedClientId = '00000000-0000-4000-8000-000000000071'

const fixtureBackend = {
  id: fixtureId,
  name: 'fixture-backend',
  azure_account: 'fixtureaccount',
  auth_mode: 'managed_identity',
  managed_identity_client_id: null,
  user_delegation_sas_enabled: false,
  has_secret_ref: false,
  region_label: null,
  enabled: true,
  credential_default_count: 2,
  virtual_bucket_count: 3,
  impact_token: '0123456789abcdef0123456789abcdef',
} satisfies components['schemas']['StorageBackendProjection']

test('UI071-01 creates no-selector and user-assigned Managed Identity backends', async ({ page }) => {
  const verify = await mockControlApi(page)
  const payloads: components['schemas']['StorageBackendRequest'][] = []
  await page.route(/\/admin\/ui\/backends$/, async route => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as components['schemas']['StorageBackendRequest']
      payloads.push(payload)
      return route.fulfill({ status: 201, json: {
        id: fixtureId, name: payload.name, azure_account: payload.azure_account,
        auth_mode: payload.auth_mode, managed_identity_client_id: payload.managed_identity_client_id ?? null,
        user_delegation_sas_enabled: payload.user_delegation_sas_enabled ?? false,
        has_secret_ref: false, region_label: payload.region_label ?? null, enabled: payload.enabled ?? true,
      } satisfies components['schemas']['StorageBackendResponse'] })
    }
    return route.fallback()
  })

  const document = await page.goto('/admin/ui/azure-backends')
  expect(document?.headers()['content-type']).toContain('text/html')
  await expect(page.getByText('fixture-backend', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('fixture-backend', { exact: true })).toBeVisible()
  await navigateTo(page, 'Azure backends')
  await expect(page).toHaveURL(/\/admin\/ui\/azure-backends$/)
  await page.getByRole('button', { name: 'Register backend' }).click()
  await expect(page.getByLabel('Authentication').getByRole('option')).toHaveCount(1)
  await expect(page.getByLabel('Authentication')).toHaveValue('managed_identity')
  await expect(page.getByLabel('Secret reference')).toHaveCount(0)
  await page.getByLabel('Name').fill('system-identity')
  await page.getByLabel('Azure account').fill('systemaccount')
  await page.getByRole('button', { name: 'Review and save' }).click()

  await page.getByRole('button', { name: 'Register backend' }).click()
  await page.getByLabel('Name').fill('selected-identity')
  await page.getByLabel('Azure account').fill('selectedaccount')
  await page.getByLabel('Managed Identity client ID').fill(selectedClientId)
  await page.getByRole('button', { name: 'Review and save' }).click()

  expect(payloads).toHaveLength(2)
  expect(payloads[0].managed_identity_client_id).toBeNull()
  expect(payloads[0].secret_ref).toBeNull()
  expect(payloads[1].managed_identity_client_id).toBe(selectedClientId)
  expect(payloads[1].secret_ref).toBeNull()
  verify()
})

test('UI071-02 recovers from duplicate create and guards referenced changes', async ({ page }) => {
  const verify = await mockControlApi(page)
  let backend: components['schemas']['StorageBackendProjection'] = { ...fixtureBackend }
  let createAttempts = 0
  let deleteAttempts = 0
  let updateAttempts = 0
  let reloadAttempts = 0
  await page.route(/\/admin\/ui\/backends$/, async route => {
    if (route.request().isNavigationRequest()) return route.fallback()
    const method = route.request().method()
    if (method === 'GET') return route.fulfill({ json: { count: 1, items: [backend] } satisfies components['schemas']['StorageBackendProjectionListResponse'] })
    if (method === 'POST') {
      createAttempts += 1
      if (createAttempts === 1) return route.fulfill({ status: 409, json: { message: 'Storage backend name already exists' } })
      const payload = route.request().postDataJSON() as components['schemas']['StorageBackendRequest']
      return route.fulfill({ status: 201, json: {
        id: selectedClientId, name: payload.name, azure_account: payload.azure_account,
        auth_mode: payload.auth_mode, managed_identity_client_id: payload.managed_identity_client_id ?? null,
        user_delegation_sas_enabled: payload.user_delegation_sas_enabled ?? false,
        has_secret_ref: false, region_label: payload.region_label ?? null, enabled: payload.enabled ?? true,
      } satisfies components['schemas']['StorageBackendResponse'] })
    }
    return route.fallback()
  })
  await page.route(`**/admin/ui/backends/${fixtureBackend.name}`, async route => {
    if (route.request().method() === 'GET') {
      reloadAttempts += 1
      if (reloadAttempts === 1) return route.fulfill({ status: 503, json: { message: 'Metadata temporarily unavailable' } })
      return route.fulfill({ json: backend })
    }
    if (route.request().method() !== 'PUT') return route.fallback()
    const payload = route.request().postDataJSON() as components['schemas']['StorageBackendUpdateRequest']
    updateAttempts += 1
    if (updateAttempts === 1) {
      expect(payload.expected_impact_token).toBe(fixtureBackend.impact_token)
      backend = { ...backend, credential_default_count: 4, impact_token: 'abcdef0123456789abcdef0123456789' }
      return route.fulfill({ status: 409, json: { message: 'Backend or references changed. Reload and review the updated impact before saving.' } })
    }
    expect(payload.expected_impact_token).toBe(backend.impact_token)
    backend = { ...backend, azure_account: payload.azure_account, enabled: payload.enabled }
    return route.fulfill({ json: {
      id: backend.id, name: payload.name, azure_account: payload.azure_account,
      auth_mode: payload.auth_mode, managed_identity_client_id: payload.managed_identity_client_id ?? null,
      user_delegation_sas_enabled: payload.user_delegation_sas_enabled ?? false,
      has_secret_ref: false, region_label: payload.region_label ?? null, enabled: payload.enabled ?? true,
    } satisfies components['schemas']['StorageBackendResponse'] })
  })
  await page.route(`**/admin/backends/${fixtureBackend.name}`, route => {
    deleteAttempts += 1
    return deleteAttempts === 1
      ? route.fulfill({ status: 409, json: { message: 'Storage backend is referenced by a credential or virtual bucket' } })
      : route.fulfill({ status: 204 })
  })

  await page.goto('/admin/ui/azure-backends')
  await page.getByRole('button', { name: 'Register backend' }).click()
  await page.getByLabel('Name').fill('fixture-backend')
  await page.getByLabel('Azure account').fill('duplicateaccount')
  await page.getByRole('button', { name: 'Review and save' }).click()
  await expect(page.getByText(/HTTP 409.*The resource changed/)).toBeVisible()
  await page.getByLabel('Name').fill('recovered-backend')
  await page.getByRole('button', { name: 'Review and save' }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)

  await page.getByRole('button', { name: 'Edit fixture-backend' }).click()
  await page.getByLabel('Azure account').fill('updatedaccount')
  await page.getByLabel('Region label').fill('changedregion')
  await page.getByLabel('User Delegation SAS enabled').check()
  await page.getByRole('button', { name: 'Review and save' }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('2 identities / 3 mappings')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByLabel('Azure account')).toHaveValue('updatedaccount')
  await expect(page.getByLabel('Region label')).toHaveValue('changedregion')
  await expect(page.getByLabel('User Delegation SAS enabled')).toBeChecked()
  await page.getByRole('button', { name: 'Review and save' }).click()
  await page.getByRole('button', { name: 'Confirm change' }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('HTTP 409')
  expect(backend.azure_account).toBe('fixtureaccount')
  await expect(page.getByRole('button', { name: 'Confirm change' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reload backend' }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('HTTP 503')
  await page.getByRole('button', { name: 'Reload backend' }).click()
  await expect(page.getByLabel('Azure account')).toHaveValue('fixtureaccount')
  await page.getByLabel('Azure account').fill('updatedaccount')
  await page.getByRole('button', { name: 'Review and save' }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('4 identities / 3 mappings')
  await page.getByRole('button', { name: 'Confirm change' }).click()
  await expect(page.getByText('updatedaccount', { exact: true })).toBeVisible()
  expect(backend.azure_account).toBe('updatedaccount')

  await page.getByRole('button', { name: 'Delete fixture-backend' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete fixture-backend', exact: true }).click()
  await expect(page.getByText(/HTTP 409.*The resource changed/)).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete fixture-backend', exact: true }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  expect(createAttempts).toBe(2)
  expect(deleteAttempts).toBe(2)
  expect(updateAttempts).toBe(2)
  expect(reloadAttempts).toBe(2)
  verify()
})

test('UI071-04 inspects safe details for unavailable backend modes', async ({ page }) => {
  const verify = await mockControlApi(page)
  const items = ['account_key', 'sas_token'].map((mode, index) => ({
    ...fixtureBackend, id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    name: `${mode}-backend`, auth_mode: mode as components['schemas']['BackendAuthMode'],
    has_secret_ref: true, region_label: 'eastus2',
  }))
  await page.route(/\/admin\/ui\/backends$/, route => {
    if (route.request().isNavigationRequest() || route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ json: { count: items.length, items } satisfies components['schemas']['StorageBackendProjectionListResponse'] })
  })
  await page.goto('/admin/ui/azure-backends')
  for (const backend of items) {
    await expect(page.getByRole('button', { name: `Edit ${backend.name}` })).toBeDisabled()
    await page.getByRole('button', { name: `View ${backend.name}` }).click()
    const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
    await expect(dialog).toContainText('Secret reference presentYes')
    await expect(dialog).toContainText('Region labeleastus2')
    await expect(dialog).toContainText('User Delegation SASDisabled')
    await expect(dialog).toContainText('IdentityNot applicable')
    await expect(dialog.locator('input, select')).toHaveCount(0)
    await expect(dialog).not.toContainText(backend.impact_token)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  }
  verify()
})