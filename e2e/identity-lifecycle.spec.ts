import { expect, test } from '@playwright/test'
import { mockControlApi, navigateTo } from './control-fixtures'
import type { components } from '../src/api/schema'

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