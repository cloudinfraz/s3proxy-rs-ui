import { expect, test } from '@playwright/test'
import { mockControlApi, navigateTo } from './control-fixtures'

test('UI068-01 typed collections render rows and overview counts', async ({ page }) => {
  const verifyRequests = await mockControlApi(page)
  await page.goto('/admin/ui/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.locator('.metric strong')).toHaveText(['1', '1', '1', '1'])
  for (const [label, value] of [
    ['Credentials', 'fixture-access'], ['Policies', 'fixture-policy'],
    ['Storage backends', 'fixture-backend'], ['Virtual buckets', 'fixture-bucket'],
    ['Admin keys', 'fixture-admin'],
  ]) {
    await navigateTo(page, label === 'Storage backends' ? 'Backends' : label)
    await expect(page.getByRole('cell', { name: value, exact: true })).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(1)
  }
  verifyRequests()
})

test('UI068-02 empty envelopes and arrays show zero counts and empty tables', async ({ page }) => {
  const verifyRequests = await mockControlApi(page, true)
  await page.goto('/admin/ui/')
  await expect(page.locator('.metric strong')).toHaveText(['0', '0', '0', '0'])
  for (const label of ['Credentials', 'Policies', 'Backends', 'Virtual buckets', 'Admin keys']) {
    await navigateTo(page, label)
    await expect(page.getByText('No records', { exact: true })).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(0)
  }
  verifyRequests()
})

test('UI068-02 failed collection reads show an error and recover on reload', async ({ page }) => {
  const verifyRequests = await mockControlApi(page)
  await page.route('**/admin/credentials', route => route.fulfill({ status: 503, json: { message: 'Control service unavailable' } }))
  await page.goto('/admin/ui/credentials')
  await expect(page.getByText('Control service unavailable', { exact: true })).toBeVisible()
  await expect(page.getByText('No records', { exact: true })).toHaveCount(0)
  await page.unroute('**/admin/credentials')
  await page.reload()
  await expect(page.getByRole('cell', { name: 'fixture-access', exact: true })).toBeVisible()
  await expect(page.getByText('Control service unavailable', { exact: true })).toHaveCount(0)
  verifyRequests()
})

test('UI068-06 malformed envelopes fail visibly instead of appearing empty', async ({ page }) => {
  await mockControlApi(page)
  await page.route('**/admin/credentials', route => route.fulfill({ json: { count: 0 } }))
  await page.goto('/admin/ui/credentials')
  await expect(page.getByText('Invalid resource collection response', { exact: true })).toBeVisible()
  await expect(page.getByText('No records', { exact: true })).toHaveCount(0)
  await page.unroute('**/admin/credentials')
  await page.reload()
  await expect(page.getByRole('cell', { name: 'fixture-access', exact: true })).toBeVisible()
})