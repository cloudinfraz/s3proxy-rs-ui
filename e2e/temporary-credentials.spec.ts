import { expect, test, type Page } from '@playwright/test'
import type { components } from '../src/api/schema'
import { capabilities as baseCapabilities, mockControlApi } from './control-fixtures'

type Capabilities = components['schemas']['ControlCapabilities']
type Role = components['schemas']['AdminIamRoleProjection']

const firstRole: Role = {
  id: '00000000-0000-4000-8000-000000000074',
  role_id: 'AROA0000000000000074',
  account_id: '123456789012',
  role_path: '/reports/',
  role_name: 'Reader',
  role_arn: 'arn:aws:iam::123456789012:role/reports/Reader',
  resource_credential_id: '00000000-0000-4000-8000-000000000001',
  max_session_duration_seconds: 3600,
  enabled: true,
  lifecycle_revision: 1,
  trust_revision: 2,
  attachment_revision: 3,
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
}
const secondRole: Role = { ...firstRole, id: '00000000-0000-4000-8000-000000000075', role_id: 'AROA0000000000000075', role_name: 'ArchiveWriter', max_session_duration_seconds: 7200 }
const limits = { min_duration_seconds: 3600, max_duration_seconds: 43200, max_retirement_batch: 1000, retained_count_cap: 1000, default_page_size: 100, max_page_size: 200 } as const

async function temporaryCredentialsFixture(page: Page) {
  const verifyControl = await mockControlApi(page)
  let current: Capabilities = { ...baseCapabilities }
  const observed: string[] = []
  const failures = { capabilities: false, roles: false }
  let capabilityGate: Promise<void> | null = null
  let rolesGate: Promise<void> | null = null
  await page.route('**/admin/capabilities', async route => {
    const method = route.request().method()
    observed.push(`${method} /admin/capabilities`)
    if (method !== 'GET') throw new Error(`Unexpected capabilities request: ${method}`)
    if (capabilityGate) await capabilityGate
    if (failures.capabilities) return route.fulfill({ status: 503, body: 'Runtime capabilities unavailable' })
    await route.fulfill({ json: current })
  })
  await page.route('**/admin/ui/roles**', async route => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    observed.push(`${method} ${url.pathname}${url.search}`)
    if (method !== 'GET') throw new Error(`Unexpected roles request: ${method}`)
    if (rolesGate) await rolesGate
    if (failures.roles) return route.fulfill({ status: 503, body: 'Role summaries unavailable' })
    const next = url.searchParams.get('after_id')
    await route.fulfill({ json: { items: next ? [secondRole] : [firstRole], next_after_id: next ? null : firstRole.id, limits } satisfies components['schemas']['AdminIamRolePage'] })
  })
  return {
    setCapabilities(changes: Partial<Capabilities>) { current = { ...baseCapabilities, ...changes } },
    failures,
    holdRequests() {
      let releaseCapabilities = () => {}
      let releaseRoles = () => {}
      capabilityGate = new Promise(resolve => { releaseCapabilities = resolve })
      rolesGate = new Promise(resolve => { releaseRoles = resolve })
      return () => {
        releaseCapabilities()
        releaseRoles()
        capabilityGate = null
        rolesGate = null
      }
    },
    observed,
    verify() { verifyControl() },
  }
}

test('UI074-01 renders every readiness blocker and independent endpoint state', async ({ page }) => {
  const fixture = await temporaryCredentialsFixture(page)
  await page.goto('/admin/ui/temporary-credentials')
  await expect(page.getByRole('heading', { name: 'AssumeRole disabled' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Client endpoints' }).getByText('Not configured')).toHaveCount(2)

  const states: Array<[Partial<Capabilities>, string]> = [
    [{ sts_enabled: true }, 'AssumeRole partially configured'],
    [{ iam_assume_role_enabled: true }, 'AssumeRole partially configured'],
    [{ sts_enabled: true, iam_assume_role_enabled: true }, 'IAM account configuration required'],
    [{ sts_enabled: true, iam_assume_role_enabled: true, iam_account_configured: true }, 'AssumeRole dependency unavailable'],
    [{ sts_enabled: true, iam_assume_role_enabled: true, iam_account_configured: true, assume_role_ready: true, public_sts_endpoint: 'https://control.example.test/sts', public_s3_endpoint: 'https://data.example.test' }, 'AssumeRole ready'],
  ]
  for (const [changes, title] of states) {
    fixture.setCapabilities(changes)
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
  }
  await expect(page.getByText('https://control.example.test/sts', { exact: true })).toBeVisible()
  await expect(page.getByText('https://data.example.test', { exact: true })).toBeVisible()
  fixture.verify()
})

test('UI074-02 shows role limits, pagination, signing services, and placeholder-only client examples', async ({ page }, testInfo) => {
  const fixture = await temporaryCredentialsFixture(page)
  fixture.setCapabilities({
    plane: 'control', sts_enabled: true, iam_assume_role_enabled: true,
    iam_account_configured: true, assume_role_ready: true,
    public_sts_endpoint: 'https://control.example.test/sts',
    public_s3_endpoint: 'https://data.example.test',
  })
  await page.goto('/admin/ui/temporary-credentials')
  await expect(page.getByText('fixed 3600-second default')).toBeVisible()
  await expect(page.getByText('configurable role-specific maximum', { exact: false })).toBeVisible()
  await expect(page.getByRole('cell', { name: '3600 seconds' })).toBeVisible()
  await expect(page.getByText('service sts')).toBeVisible()
  await expect(page.getByText('service s3')).toBeVisible()
  const issueCli = page.getByText('AWS CLI: issue credentials').locator('..').locator('..')
  await expect(issueCli).toContainText("aws sts assume-role")
  await expect(issueCli).toContainText("https://control.example.test/sts")
  const s3Cli = page.getByText('AWS CLI: use credentials with S3').locator('..').locator('..')
  await expect(s3Cli).toContainText('AWS_SESSION_TOKEN')
  await expect(s3Cli).toContainText('https://data.example.test')
  await expect(page.getByText('AWS SDK for JavaScript v3').locator('..').locator('..')).toContainText('sessionToken')
  await page.getByRole('button', { name: 'Next role page' }).click()
  await expect(page.getByRole('cell', { name: 'ArchiveWriter' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '7200 seconds' })).toBeVisible()
  await expect(page.getByText('Controls future issuance and does not independently retire an existing session.')).toBeVisible()
  await expect(page.getByText('Change the permissions evaluated for active sessions.')).toBeVisible()
  expect(fixture.observed.filter(value => value.startsWith('GET /admin/ui/roles'))).toEqual([
    'GET /admin/ui/roles?limit=100',
    `GET /admin/ui/roles?limit=100&after_id=${firstRole.id}`,
  ])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('temporary-credentials-guidance.png'), fullPage: true })
  fixture.verify()
})

test('UI074-03 does not collect, persist, request, or render credential values', async ({ page }) => {
  const fixture = await temporaryCredentialsFixture(page)
  const secretMarker = 'synthetic-live-secret-must-not-appear'
  await page.goto(`/admin/ui/temporary-credentials#${encodeURIComponent('guidance')}`)
  await expect(page.locator('input, textarea, select')).toHaveCount(0)
  const browserState = await page.evaluate(() => ({
    local: { ...localStorage }, session: { ...sessionStorage },
    url: window.location.href, body: document.body.textContent,
  }))
  expect(browserState.local).toEqual({})
  expect(browserState.session).toEqual({})
  expect(JSON.stringify(browserState)).not.toContain(secretMarker)
  expect([...fixture.observed].sort()).toEqual(['GET /admin/capabilities', 'GET /admin/ui/roles?limit=100'])
  await expect(page.getByRole('button', { name: /Copy AWS/ })).toHaveCount(3)
  fixture.verify()
})

test('UI074-01 exposes loading, request failures, and explicit recovery', async ({ page }) => {
  const fixture = await temporaryCredentialsFixture(page)
  fixture.setCapabilities({
    sts_enabled: true, iam_assume_role_enabled: true, iam_account_configured: true,
    assume_role_ready: true, public_sts_endpoint: 'https://control.example.test/sts',
    public_s3_endpoint: 'https://data.example.test',
  })
  const release = fixture.holdRequests()
  await page.goto('/admin/ui/temporary-credentials')
  await expect(page.getByText('Loading runtime capabilities...')).toBeVisible()
  await expect(page.getByText('Loading...', { exact: true })).toBeVisible()
  release()
  await expect(page.getByRole('heading', { name: 'AssumeRole ready' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'AWS client configuration' })).toBeVisible()

  fixture.failures.capabilities = true
  fixture.failures.roles = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(2)
  await expect(page.getByRole('alert').filter({ hasText: 'Runtime capabilities unavailable' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Role summaries unavailable' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'AssumeRole ready' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'AWS client configuration' })).toHaveCount(0)

  fixture.failures.capabilities = false
  fixture.failures.roles = false
  await page.getByRole('alert').filter({ hasText: 'Runtime capabilities unavailable' }).getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('heading', { name: 'AssumeRole ready' })).toBeVisible()
  await page.getByRole('alert').filter({ hasText: 'Role summaries unavailable' }).getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('cell', { name: 'Reader' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  fixture.verify()
})
