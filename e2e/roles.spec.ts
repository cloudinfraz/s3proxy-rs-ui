import { expect, test, type Page } from '@playwright/test'
import type { components } from '../src/api/schema'
import { collections, mockControlApi } from './control-fixtures'

type Detail = components['schemas']['AdminIamRoleDetail']
const owner = collections['/admin/ui/identities'].items[0].credential_id
const limits = { min_duration_seconds: 3600, max_duration_seconds: 43200, max_retirement_batch: 1000, retained_count_cap: 1000, default_page_size: 100, max_page_size: 200 } as const
const timestamp = '2026-09-06T00:00:00Z'
const initial: Detail = { role: { id: owner, role_id: 'AROA0000000000000001', account_id: '123456789012', role_path: '/', role_name: 'Reports', role_arn: 'arn:aws:iam::123456789012:role/Reports', resource_credential_id: owner, max_session_duration_seconds: 3600, enabled: true, lifecycle_revision: 0, trust_revision: 0, attachment_revision: 0, created_at: timestamp, updated_at: timestamp }, trust: { statements: [{ effect: 'Allow', principals: [`arn:aws:iam::123456789012:user/s3proxy/${owner}`], conditions: [{ operator: 'StringEquals', key: 'sts:ExternalId' }] }] }, policies: [], impact_token: '1'.padStart(64, '0'), limits, retained_sessions: { count: 0, truncated: false, deletion_eligible: false } }

async function fixture(page: Page, empty = false) {
  const verifyControl = await mockControlApi(page)
  let detail: Detail | null = empty ? null : structuredClone(initial)
  let sequence = 1
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  const flags = { conflict: false, failure: false, reenable: false, unavailable: false, lostResponse: false, zeroProgress: false }
  const denied: string[] = []
  const policy = { id: owner, name: 'ReadReports', revision: 7 }
  await page.route('**/*', async route => {
    const request = route.request()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback()
    const url = new URL(request.url())
    const path = url.pathname
    if (url.origin !== new URL(page.url()).origin) { denied.push('external'); return route.abort() }
    if (!path.startsWith('/admin/ui/roles') && path !== '/admin/ui/role-policies') {
      if (['/admin/session', '/admin/ui/identities', '/admin/ui/identity-pages', '/admin/capabilities'].includes(path)) return route.fallback()
      denied.push(path); return route.abort()
    }
    if (request.method() === 'GET') {
      if (flags.unavailable) return route.fulfill({ status: 503, body: 'Metadata unavailable' })
      if (path === '/admin/ui/role-policies') return route.fulfill({ json: { items: [policy], next_after_id: null } })
      if (path === '/admin/ui/roles') return route.fulfill({ json: { items: detail ? [detail.role] : [], next_after_id: null, limits } })
      return detail ? route.fulfill({ json: detail }) : route.fulfill({ status: 404, body: 'Role missing' })
    }
    expect(request.headers()['x-csrf-token']).toBe('synthetic-csrf')
    const body = request.postDataJSON()
    requests.push({ method: request.method(), path, body })
    if (flags.failure) { flags.failure = false; return route.fulfill({ status: 503, body: 'Temporary metadata failure' }) }
    if (flags.conflict || flags.reenable) {
      flags.conflict = false
      if (flags.reenable && detail) { flags.reenable = false; detail.role.enabled = true; detail.retained_sessions.deletion_eligible = false }
      if (detail) detail.impact_token = (++sequence).toString(16).padStart(64, '0')
      return route.fulfill({ status: 409, body: 'Role changed; refresh and review again' })
    }
    if (path === '/admin/ui/roles' && request.method() === 'POST') {
      detail = structuredClone(initial)
      detail.role.role_name = body.role_name
      detail.role.role_arn = `arn:aws:iam::${body.account_id}:role${body.role_path}${body.role_name}`
      detail.role.max_session_duration_seconds = body.max_session_duration_seconds
      return route.fulfill({ status: 201, json: detail })
    }
    if (!detail) return route.fulfill({ status: 404, body: 'Role missing' })
    expect(body.expected_impact_token).toBe(detail.impact_token)
    let retired: number | null = null
    if (path.endsWith('/settings')) { detail.role.max_session_duration_seconds = body.change.max_session_duration_seconds; detail.role.lifecycle_revision++ }
    if (path.endsWith('/enabled')) { detail.role.enabled = body.change.enabled; detail.role.lifecycle_revision++ }
    if (path.endsWith('/trust')) { expect(body.acknowledge_condition_replacement).toBe(true); detail.role.trust_revision++ }
    if (path.endsWith('/policies')) { expect(body.change.expected_policy_revision).toBe(7); detail.policies = request.method() === 'POST' ? [policy] : []; detail.role.attachment_revision++ }
    if (path.endsWith('/retire-sessions')) {
      expect(detail.role.enabled).toBe(false)
      expect(body.change.batch_size).toBeGreaterThan(0); expect(body.change.batch_size).toBeLessThanOrEqual(1000)
      retired = flags.zeroProgress ? 0 : Math.min(body.change.batch_size, detail.retained_sessions.count)
      flags.zeroProgress = false
      detail.retained_sessions.count -= retired
    }
    detail.retained_sessions.deletion_eligible = !detail.role.enabled && detail.retained_sessions.count === 0
    detail.impact_token = (++sequence).toString(16).padStart(64, '0')
    if (path === `/admin/ui/roles/${owner}` && request.method() === 'DELETE') {
      expect(detail.retained_sessions.deletion_eligible).toBe(true); detail = null
    }
    if (flags.lostResponse) { flags.lostResponse = false; return route.abort('timedout') }
    return route.fulfill({ json: { detail, retired_sessions: retired, deleted: detail === null } })
  })
  return { requests, flags, setCount(count: number) { if (detail) { detail.retained_sessions.count = count; detail.retained_sessions.deletion_eligible = !detail.role.enabled && count === 0 } }, verify() { expect(denied).toEqual([]); verifyControl() } }
}

async function openRole(page: Page) {
  await page.goto('/admin/ui/iam-roles')
  await page.getByRole('button', { name: 'View Reports', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Role details' })).toBeVisible()
}

test('UI073-01 creates roles with write-only trust and immutable detail metadata', async ({ page }, testInfo) => {
  const state = await fixture(page, true)
  await page.goto('/admin/ui/iam-roles')
  await expect(page.getByText('No records')).toBeVisible()
  await page.getByRole('button', { name: 'Create role', exact: true }).click()
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  await dialog.getByLabel('Account ID').fill('123456789012')
  await dialog.getByLabel('Role name').fill('Reports')
  await dialog.getByLabel('Resource owner').selectOption(owner)
  await dialog.getByLabel('Statement 1 principals').selectOption(`arn:aws:iam::123456789012:user/s3proxy/${owner}`)
  await dialog.getByRole('button', { name: 'Add condition', exact: true }).click()
  await dialog.getByLabel('New value').fill(' synthetic-external:@/#? ')
  await expect(dialog.getByLabel('New value')).toHaveAttribute('type', 'password')
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  await expect(dialog).toContainText('Write-only')
  await expect(dialog.getByRole('region', { name: 'Reviewed trust statement 1' })).toContainText('Allow')
  await expect(dialog.getByRole('region', { name: 'Reviewed trust statement 1' })).toContainText(`arn:aws:iam::123456789012:user/s3proxy/${owner}`)
  await expect(dialog.getByRole('region', { name: 'Reviewed trust statement 1' })).toContainText('StringEquals: sts:ExternalId')
  await expect(dialog).not.toContainText('synthetic-external')
  await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const region = page.getByRole('region', { name: 'Role details' })
  await expect(region).toContainText('arn:aws:iam::123456789012:role/Reports')
  await expect(region.locator('input, textarea, select')).toHaveCount(0)
  await expect(region).not.toContainText('synthetic-external')
  expect(state.requests).toHaveLength(1)
  expect(JSON.stringify(state.requests[0].body)).toContain(' synthetic-external:@/#? ')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('role-detail.png'), fullPage: true })
  expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))).toEqual({ local: [], session: [] })
  state.verify()
})

test('UI073-02 separates reviewed changes and preserves drafts after stale or failed writes', async ({ page }, testInfo) => {
  const state = await fixture(page)
  await openRole(page)
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  await page.getByRole('button', { name: 'Change duration', exact: true }).click()
  await dialog.getByLabel('Maximum duration (seconds)').fill('3599')
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  expect(state.requests).toHaveLength(0)
  await dialog.getByLabel('Maximum duration (seconds)').fill('7200')
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  state.flags.conflict = true
  await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByLabel('Maximum duration (seconds)')).toHaveValue('7200')
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Replace trust', exact: true }).click()
  await expect(dialog.getByLabel('Statement 1 principals')).toHaveValues([])
  await dialog.getByLabel('Statement 1 principals').selectOption(`arn:aws:iam::123456789012:user/s3proxy/${owner}`)
  await dialog.getByLabel('Replace all existing trust statements').check()
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('trust-review.png'), fullPage: true })
  await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  for (const action of ['Attach policy', 'Detach policy']) {
    await page.getByRole('button', { name: action, exact: true }).click()
    await dialog.getByRole('combobox', { name: /^Policy/ }).selectOption(owner)
    await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
    if (action === 'Attach policy') {
      state.flags.failure = true
      await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click()
      await expect(dialog.getByRole('combobox', { name: /^Policy/ })).toHaveValue(owner)
      await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
    }
    await dialog.getByRole('button', { name: action === 'Detach policy' ? 'Detach ReadReports' : 'Confirm change', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  expect(state.requests.map(request => request.path.split('/').pop())).toEqual(['settings', 'settings', 'trust', 'policies', 'policies', 'policies'])
  state.flags.unavailable = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  state.verify()
})

test('UI073-03 retirement is explicit, bounded, rechecks re-enable and gates deletion', async ({ page }, testInfo) => {
  const state = await fixture(page)
  state.setCount(3)
  await openRole(page)
  await expect(page.getByRole('button', { name: 'Retire sessions', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete role', exact: true })).toBeDisabled()
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  async function disable() {
    await page.getByRole('button', { name: 'Disable role', exact: true }).click()
    await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
    await dialog.getByRole('button', { name: /^(Disable|Delete) Reports$/, exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  await disable()
  await page.getByRole('button', { name: 'Retire sessions', exact: true }).click()
  await dialog.getByLabel('Maximum rows this batch').fill('2')
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  state.flags.reenable = true
  await dialog.getByRole('button', { name: 'Retire this batch', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Disable')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Disable role', exact: true })).toBeVisible()
  await disable()
  await page.getByRole('button', { name: 'Retire sessions', exact: true }).click()
  await dialog.getByLabel('Maximum rows this batch').fill('2')
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  await dialog.getByRole('button', { name: 'Retire this batch', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('Retired 2 session rows. Remaining: 1.')
  expect(state.requests.filter(request => request.path.endsWith('/retire-sessions'))).toHaveLength(2)
  await page.screenshot({ path: testInfo.outputPath('retirement-progress.png'), fullPage: true })
  await dialog.getByRole('button', { name: 'Review next batch', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  await dialog.getByRole('button', { name: 'Retire this batch', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('Retired 1 session rows. Remaining: 0.')
  await expect(dialog.getByRole('button', { name: 'Review next batch' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Delete role', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  await dialog.getByRole('button', { name: /^(Disable|Delete) Reports$/, exact: true }).click()
  await expect(page.getByRole('region', { name: 'Role details' })).toHaveCount(0)
  await expect(page.getByText('No records')).toBeVisible()
  state.verify()
})

test('UI073-03 lost retirement responses and zero progress require a fresh explicit review', async ({ page }) => {
  const state = await fixture(page)
  state.setCount(3)
  await openRole(page)
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  await page.getByRole('button', { name: 'Disable role', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  await dialog.getByRole('button', { name: /^(Disable|Delete) Reports$/, exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Retire sessions', exact: true }).click()
  await dialog.getByLabel('Maximum rows this batch').fill('2')
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  state.flags.lostResponse = true
  await dialog.getByRole('button', { name: 'Retire this batch', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByLabel('Maximum rows this batch')).toHaveValue('2')
  expect(state.requests.filter(request => request.path.endsWith('/retire-sessions'))).toHaveLength(1)
  await expect(dialog.getByRole('button', { name: 'Retire this batch', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Review change', exact: true }).click()
  await expect(dialog.locator('dt').filter({ hasText: /^Retained sessions$/ }).locator('+ dd')).toHaveText('1')
  state.flags.zeroProgress = true
  await dialog.getByRole('button', { name: 'Retire this batch', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('Retired 0 session rows. Remaining: 1.')
  expect(state.requests.filter(request => request.path.endsWith('/retire-sessions'))).toHaveLength(2)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Delete role', exact: true })).toBeDisabled()
  state.verify()
})