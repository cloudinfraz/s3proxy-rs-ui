import { expect, test } from '@playwright/test'
import { mockControlApi } from '../control-fixtures'

test('core operator workflow', async ({ page }) => {
  const verifyRequests = await mockControlApi(page)
  await page.route('**/admin/session/login', route => route.fulfill({ json: {
    csrf_token: 'synthetic-smoke-csrf',
    expires_at: '2099-01-01T00:00:00Z',
  } }))
  await page.route('**/admin/session', route => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 204 })
    : route.fulfill({ json: {
      authenticated: true,
      csrf_token: 'synthetic-smoke-csrf',
      expires_at: '2099-01-01T00:00:00Z',
    } }))

  await page.goto('/admin/ui/login')
  await page.getByLabel('Admin API key').fill('synthetic-smoke-admin-key')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

  await page.getByRole('navigation', { name: 'Control navigation' }).getByRole('link', { name: 'Admin keys' }).click()
  await expect(page.getByText('fixture-admin', { exact: true })).toBeVisible()
  const opener = page.getByRole('button', { name: 'Delete fixture-admin', exact: true })
  await opener.click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete admin key' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()

  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/ui\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  verifyRequests()
})
