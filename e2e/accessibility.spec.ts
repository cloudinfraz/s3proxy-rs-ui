import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import type { components } from '../src/api/schema'
import { accessibilityTags } from '../playwright.accessibility.config'
import { mockControlApi } from './control-fixtures'

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags([...accessibilityTags]).analyze()
  const violations = results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
  expect(violations, violations.map(violation => `${violation.id}: ${violation.help}`).join('\n')).toEqual([])
}

test('login is accessible', async ({ page }) => {
  await page.goto('/admin/ui/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expectNoBlockingViolations(page)
})

test('authenticated pages and critical dialogs are accessible', async ({ page }) => {
  const verifyRequests = await mockControlApi(page)
  await page.route('**/admin/credentials', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 201, json: {
      credential_id: '00000000-0000-4000-8000-000000000099',
      s3_access_key: 'generated-access',
      s3_secret_key: 'synthetic-accessibility-secret',
      s3_endpoint: 'https://synthetic.invalid',
      azure_account: 'testaccount',
      access_mode: 'direct',
      use_managed_identity: true,
      default_backend_id: null,
    } satisfies components['schemas']['CredentialCreatedResponse'] })
    : route.fallback())

  await page.goto('/admin/ui/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expectNoBlockingViolations(page)

  await page.getByRole('navigation', { name: 'Control navigation' }).getByRole('link', { name: 'S3 identities' }).click()
  await expect(page.getByText('fixture-access', { exact: true })).toBeVisible()
  await expectNoBlockingViolations(page)

  await page.getByRole('button', { name: 'Create identity', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Create S3 identity' })).toBeVisible()
  await expectNoBlockingViolations(page)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.getByRole('button', { name: 'Delete fixture-access', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Delete identity' })).toBeVisible()
  await expectNoBlockingViolations(page)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.getByRole('button', { name: 'Create identity', exact: true }).click()
  await page.getByLabel('Azure account').fill('testaccount')
  await page.getByRole('button', { name: 'Create identity', exact: true }).last().click()
  const secretDialog = page.getByRole('dialog', { name: 'One-time S3 credentials' })
  await expect(secretDialog).toContainText('synthetic-accessibility-secret')
  await expectNoBlockingViolations(page)
  await secretDialog.getByRole('button', { name: 'I have stored this securely' }).click()

  verifyRequests()
})
