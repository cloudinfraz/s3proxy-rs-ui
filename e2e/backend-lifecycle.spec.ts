import { expect, test } from '@playwright/test'
import type { components } from '../src/api/schema'
import { mockControlApi } from './control-fixtures'

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

  await page.goto('/admin/ui/backends')
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
  let backend = fixtureBackend
  let createAttempts = 0
  let deleteAttempts = 0
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
    if (route.request().method() === 'GET') return route.fulfill({ json: backend })
    const payload = route.request().postDataJSON() as components['schemas']['StorageBackendRequest']
    backend = { ...backend, ...payload, has_secret_ref: false }
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

  await page.goto('/admin/ui/backends')
  await page.getByRole('button', { name: 'Register backend' }).click()
  await page.getByLabel('Name').fill('fixture-backend')
  await page.getByLabel('Azure account').fill('duplicateaccount')
  await page.getByRole('button', { name: 'Review and save' }).click()
  await expect(page.getByText(/HTTP 409.*already exists/)).toBeVisible()
  await page.getByLabel('Name').fill('recovered-backend')
  await page.getByRole('button', { name: 'Review and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Edit fixture-backend' }).click()
  await page.getByLabel('Azure account').fill('updatedaccount')
  await page.getByRole('button', { name: 'Review and save' }).click()
  await expect(page.getByRole('dialog')).toContainText('2 identities / 3 mappings')
  await page.getByRole('button', { name: 'Confirm change' }).click()
  await expect(page.getByRole('cell', { name: 'updatedaccount', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Delete fixture-backend' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText(/HTTP 409.*referenced/)).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(createAttempts).toBe(2)
  expect(deleteAttempts).toBe(2)
  verify()
})