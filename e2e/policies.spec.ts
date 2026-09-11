import { expect, test, type Page } from '@playwright/test'
import type { components } from '../src/api/schema'
import { collections, mockControlApi } from './control-fixtures'

type PolicyDetail = components['schemas']['AdminPolicyDetail']
type PolicyPage = components['schemas']['AdminPolicyPage']
type IdentityPage = components['schemas']['AdminIdentityPolicyPage']
type BucketDetail = components['schemas']['AdminBucketPolicyDetail']
type BucketPage = components['schemas']['AdminBucketPolicyPage']
type SimulationEffect = components['schemas']['AdminPolicySimulationEffect']

const timestamp = '2026-09-07T00:00:00Z'
const ownerA = '00000000-0000-4000-8000-000000000101'
const ownerB = '00000000-0000-4000-8000-000000000102'
const editableId = '00000000-0000-4000-8000-000000000201'
const fullAccessId = '00000000-0000-4000-8000-000000000202'
const attachId = '00000000-0000-4000-8000-000000000203'
const virtualA = '00000000-0000-4000-8000-000000000301'
const virtualB = '00000000-0000-4000-8000-000000000302'
const allowDocument = { Version: '2012-10-17', Statement: [{ Sid: 'AllowRead', Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::reports/*' }] }
const denyDocument = { Version: '2012-10-17', Statement: [{ Sid: 'DenyDelete', Effect: 'Deny', Action: 's3:DeleteObject', Resource: 'arn:aws:s3:::reports/*' }] }

const editableSummary = { id: editableId, name: 'ReportsRead', description: 'Read reports', revision: 4, built_in: false, deletable: true, credential_attachment_count: 2, role_attachment_count: 1, updated_at: timestamp } satisfies components['schemas']['AdminPolicySummary']
const fullAccessSummary = { id: fullAccessId, name: 'FullAccess', description: 'Protected built-in policy', revision: 9, built_in: true, deletable: false, credential_attachment_count: 1, role_attachment_count: 2, updated_at: timestamp } satisfies components['schemas']['AdminPolicySummary']
const attachSummary = { id: attachId, name: 'ReportsDenyDelete', description: null, revision: 7, built_in: false, deletable: true, credential_attachment_count: 0, role_attachment_count: 0, updated_at: timestamp } satisfies components['schemas']['AdminPolicySummary']

function detail(policy: components['schemas']['AdminPolicySummary'] = editableSummary, document: unknown = allowDocument, token = '1'.padStart(64, '0')): PolicyDetail {
  return { policy: structuredClone(policy), document: structuredClone(document), impact_token: token }
}

async function assertBrowserBoundary(page: Page) {
  expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), fits: document.documentElement.scrollWidth <= window.innerWidth }))).toEqual({ local: [], session: [], fits: true })
}

async function openPolicies(page: Page) {
  await page.goto('/admin/ui/')
  const menu = page.getByRole('button', { name: 'Open navigation', includeHidden: true })
  await menu.waitFor({ state: 'attached' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Control navigation' }).getByRole('link', { name: 'Policies', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Authorization policies' })).toBeVisible()
}

async function managedFixture(page: Page) {
  const verifyControl = await mockControlApi(page)
  let editable = detail()
  let created: PolicyDetail | null = null
  let conflict = false
  let validation: 'valid' | 'unsupported' = 'valid'
  const requests: Array<{ method: string; path: string; body: unknown }> = []
  const unexpected: string[] = []
  await page.route('**/*', async route => {
    const request = route.request()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback()
    const url = new URL(request.url())
    const path = url.pathname
    if (url.origin !== new URL(page.url()).origin) { unexpected.push(`external ${url.origin}`); return route.abort() }
    if (!path.startsWith('/admin/ui/policies')) return route.fallback()
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() : null
    requests.push({ method, path, body })
    if (method !== 'GET') expect(request.headers()['x-csrf-token']).toBe('synthetic-csrf')
    if (path === '/admin/ui/policies' && method === 'GET') {
      const page = { items: [editable.policy, fullAccessSummary, attachSummary], next_after_id: null, default_page_size: 100, max_page_size: 200 } satisfies PolicyPage
      return route.fulfill({ json: page })
    }
    if (path === '/admin/ui/policies/validate' && method === 'POST') {
      const response = validation === 'valid'
        ? { valid: true, violations: [], json_bytes: JSON.stringify(body.document).length, statements: 1, compiled_bytes: 128 }
        : { valid: false, violations: [{ field: 'Statement[0].Condition', code: 'unsupported', message: 'Unsupported policy condition semantics' }], json_bytes: JSON.stringify(body.document).length, statements: 1, compiled_bytes: 0 }
      return route.fulfill({ json: response satisfies components['schemas']['AdminPolicyDraftValidationResponse'] })
    }
    if (path === '/admin/ui/policies' && method === 'POST') {
      created = detail({ ...editableSummary, id: '00000000-0000-4000-8000-000000000204', name: body.name, description: body.description, revision: 1, credential_attachment_count: 0, role_attachment_count: 0 }, body.document, '2'.padStart(64, '0'))
      return route.fulfill({ status: 201, json: created })
    }
    const id = path.split('/').pop()
    if (method === 'GET') {
      if (created && id === created.policy.id) return route.fulfill({ json: created })
      if (id === editableId) return route.fulfill({ json: editable })
      if (id === fullAccessId) return route.fulfill({ json: detail(fullAccessSummary, allowDocument, '9'.padStart(64, '0')) })
      if (id === attachId) return route.fulfill({ json: detail(attachSummary, denyDocument, '7'.padStart(64, '0')) })
    }
    if (id === editableId && method === 'PUT') {
      if (conflict) { conflict = false; editable = { ...editable, impact_token: '5'.padStart(64, '0') }; return route.fulfill({ status: 409, body: 'Policy changed; refresh and review again' }) }
      expect(body.expected_impact_token).toBe(editable.impact_token)
      editable = detail({ ...editable.policy, description: body.change.description, revision: editable.policy.revision + 1 }, body.change.document, '6'.padStart(64, '0'))
      const response = { changed: true, deleted: false, detail: editable } satisfies components['schemas']['AdminPolicyMutationResult']
      return route.fulfill({ json: response })
    }
    unexpected.push(`${method} ${path}`)
    return route.abort()
  })
  return { requests, setConflict() { conflict = true }, setValidation(value: 'valid' | 'unsupported') { validation = value }, created: () => created, verify() { expect(unexpected).toEqual([]); verifyControl() } }
}

test('UI075-01a managed list/detail, valid create/edit review, impact, and protected deletion', async ({ page }) => {
  const state = await managedFixture(page)
  await openPolicies(page)
  await page.getByRole('button', { name: 'View ReportsRead' }).click()
  const region = page.getByRole('region', { name: 'Managed policy detail' })
  await expect(region).toContainText(editableId)
  await expect(region).toContainText('2')
  await expect(region).toContainText('AllowRead')
  await page.getByRole('button', { name: 'Create policy' }).click()
  let dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  await dialog.getByLabel('Policy name').fill('ArchiveRead')
  await dialog.getByLabel('Description').fill('Archive access')
  await dialog.getByLabel('Policy document').fill(JSON.stringify(allowDocument))
  await dialog.getByRole('button', { name: 'Review change' }).click()
  await expect(dialog).toContainText('Validated bytes')
  await dialog.getByRole('button', { name: 'Confirm change' }).click()
  await expect(region).toContainText('ArchiveRead')
  expect(state.created()?.policy.name).toBe('ArchiveRead')
  await page.getByRole('button', { name: 'Close policy detail' }).click()
  await page.getByRole('button', { name: 'View ReportsRead' }).click()
  await page.getByRole('button', { name: 'Edit policy' }).click()
  dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  await dialog.getByLabel('Description').fill('Reviewed report access')
  await dialog.getByLabel('Policy document').fill(JSON.stringify(denyDocument))
  await dialog.getByRole('button', { name: 'Review change' }).click()
  await expect(dialog).toContainText('2 attachments')
  await expect(dialog).toContainText('1 attachments and active sessions')
  await dialog.getByRole('button', { name: 'Confirm change' }).click()
  await expect(region).toContainText('Reviewed report access')
  await page.getByRole('button', { name: 'Close policy detail' }).click()
  await page.getByRole('button', { name: 'View FullAccess' }).click()
  await expect(region).toContainText('Built in and protected')
  await expect(region.getByRole('button', { name: 'Delete policy' })).toBeDisabled()
  await assertBrowserBoundary(page)
  state.verify()
})

test('UI075-01b malformed/unsupported drafts and stale 409 preserve exact draft then recover', async ({ page }) => {
  const state = await managedFixture(page)
  await openPolicies(page)
  await page.getByRole('button', { name: 'View ReportsRead' }).click()
  await page.getByRole('button', { name: 'Edit policy' }).click()
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  const editor = dialog.getByLabel('Policy document')
  await editor.fill('{ malformed')
  await dialog.getByRole('button', { name: 'Review change' }).click()
  await expect(dialog.getByRole('alert')).toContainText('valid JSON')
  expect(state.requests.filter(request => request.path.endsWith('/validate'))).toHaveLength(0)
  const unsupportedDraft = JSON.stringify({ ...allowDocument, Statement: [{ ...allowDocument.Statement[0], Condition: { NumericEquals: { 's3:max-keys': '1' } } }] }, null, 2)
  state.setValidation('unsupported')
  await editor.fill(unsupportedDraft)
  await dialog.getByRole('button', { name: 'Review change' }).click()
  await expect(dialog).toContainText('Unsupported policy condition semantics')
  state.setValidation('valid')
  const exactDraft = `${JSON.stringify(denyDocument, null, 2)}\n`
  await editor.fill(exactDraft)
  await dialog.getByLabel('Description').fill('draft-preserved:@/#?')
  await dialog.getByRole('button', { name: 'Review change' }).click()
  state.setConflict()
  await dialog.getByRole('button', { name: 'Confirm change' }).click()
  await expect(dialog).toContainText('unsaved draft is preserved')
  await expect(editor).toHaveValue(exactDraft)
  await expect(dialog.getByLabel('Description')).toHaveValue('draft-preserved:@/#?')
  await dialog.getByRole('button', { name: 'Review change' }).click()
  await dialog.getByRole('button', { name: 'Confirm change' }).click()
  await expect(dialog).toHaveCount(0)
  expect(state.requests.filter(request => request.method === 'PUT')).toHaveLength(2)
  await assertBrowserBoundary(page)
  state.verify()
})

async function identityFixture(page: Page) {
  const verifyControl = await mockControlApi(page)
  let revision = 11
  let token = 'a'.repeat(64)
  let attachments = [{ policy_id: editableId, policy_name: 'ReportsRead', policy_revision: 4, attached_at: timestamp }] satisfies components['schemas']['AdminIdentityPolicyAttachment'][]
  let failure: 409 | 503 | null = null
  const requests: Array<{ method: string; body: components['schemas']['ReviewCredentialPolicyRequest'] }> = []
  const unexpected: string[] = []
  await page.route('**/*', async route => {
    const request = route.request()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback()
    const url = new URL(request.url())
    const path = url.pathname
    if (url.origin !== new URL(page.url()).origin) { unexpected.push(`external ${url.origin}`); return route.abort() }
    if (path === '/admin/ui/identity-pages' && request.method() === 'GET') {
      const response = { items: [{ ...collections['/admin/ui/identities'].items[0], credential_id: ownerA, s3_access_key: 'policy-owner', policy_attachment_count: attachments.length }], next_after_id: null, default_page_size: 100, max_page_size: 200 } satisfies components['schemas']['IdentityProjectionPage']
      return route.fulfill({ json: response })
    }
    if (path === '/admin/ui/policies' && request.method() === 'GET') {
      const response = { items: [editableSummary, attachSummary], next_after_id: null, default_page_size: 100, max_page_size: 200 } satisfies PolicyPage
      return route.fulfill({ json: response })
    }
    if (path !== `/admin/ui/identities/${ownerA}/policies`) return route.fallback()
    if (request.method() === 'GET') {
      const response = { credential_id: ownerA, credential_revision: revision, items: attachments, next_after_id: null, impact_token: token, default_page_size: 100, max_page_size: 200 } satisfies IdentityPage
      return route.fulfill({ json: response })
    }
    const body = request.postDataJSON() as components['schemas']['ReviewCredentialPolicyRequest']
    requests.push({ method: request.method(), body })
    expect(request.headers()['x-csrf-token']).toBe('synthetic-csrf')
    if (failure) { const status = failure; failure = null; if (status === 409) { revision++; token = 'b'.repeat(64) }; return route.fulfill({ status, body: status === 409 ? 'Identity changed; refresh and review again' : 'Attachment limit or metadata dependency unavailable' }) }
    expect(body.expected_credential_revision).toBe(revision)
    expect(body.expected_impact_token).toBe(token)
    if (request.method() === 'POST') attachments = [...attachments, { policy_id: attachId, policy_name: 'ReportsDenyDelete', policy_revision: 7, attached_at: timestamp }]
    else attachments = attachments.filter(item => item.policy_id !== body.policy.policy_id)
    revision++; token = revision.toString(16).padStart(64, '0')
    const response = { changed: true, detail: { credential_id: ownerA, credential_revision: revision, attachments, impact_token: token } } satisfies components['schemas']['AdminIdentityPolicyMutationResult']
    return route.fulfill({ json: response })
  })
  return { requests, fail(status: 409 | 503) { failure = status }, externalChange() { revision++; token = 'c'.repeat(64) }, verify() { expect(unexpected).toEqual([]); verifyControl() } }
}

test('UI075-02 identity reviewed attach/detach, revisions, conflict/limit recovery, and role impact', async ({ page }) => {
  const state = await identityFixture(page)
  await openPolicies(page)
  await expect(page.getByText('Permission changes affect attached identities and active role sessions.')).toBeVisible()
  await page.getByRole('tab', { name: 'Identity attachments' }).click()
  const identityRegion = page.getByRole('region', { name: 'Identity attachments' })
  await identityRegion.getByRole('combobox').first().selectOption(ownerA)
  await expect(page.getByText('ReportsRead')).toBeVisible()
  await page.getByLabel('Managed policy').selectOption(attachId)
  await page.getByRole('button', { name: 'Review attachment' }).click()
  let dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  await expect(dialog).toContainText(ownerA)
  await expect(dialog).toContainText('11')
  await expect(dialog).toContainText('7')
  state.externalChange(); state.fail(409)
  await dialog.getByRole('button', { name: 'Attach policy' }).click()
  await expect(page.getByRole('alert')).toContainText('The resource changed')
  await page.getByLabel('Managed policy').selectOption(attachId)
  await page.getByRole('button', { name: 'Review attachment' }).click()
  dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
  await expect(dialog).toContainText('13')
  state.fail(503)
  await dialog.getByRole('button', { name: 'Attach policy' }).click()
  await expect(page.getByRole('alert')).toContainText('The control service is temporarily unavailable')
  await page.getByLabel('Managed policy').selectOption(attachId)
  await page.getByRole('button', { name: 'Review attachment' }).click()
  await page.getByRole('dialog').or(page.getByRole('alertdialog')).getByRole('button', { name: 'Attach policy' }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Detach ReportsDenyDelete' })).toBeVisible()
  await page.getByRole('button', { name: 'Detach ReportsDenyDelete' }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('14')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Detach ReportsDenyDelete' }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Detach ReportsDenyDelete' })).toHaveCount(0)
  await expect(page.getByLabel('Managed policy').getByRole('option', { name: 'ReportsDenyDelete' })).toHaveCount(1)
  await expect(page.getByText('IAM role policy attachments use the existing reviewed role workflow.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Manage role attachments' })).toHaveAttribute('href', '/admin/ui/iam-roles')
  expect(state.requests.map(request => [request.method, request.body.expected_credential_revision, request.body.policy.expected_policy_revision])).toEqual([['POST', 11, 7], ['POST', 13, 7], ['POST', 13, 7], ['DELETE', 14, 7]])
  await assertBrowserBoundary(page)
  state.verify()
})

async function bucketFixture(page: Page) {
  const verifyControl = await mockControlApi(page)
  const directScope = { kind: 'direct', bucket: 'shared-alias' } satisfies components['schemas']['AdminDirectBucketPolicyScope']
  const scopeA = { kind: 'virtual', bucket_id: virtualA, bucket: 'shared-alias', credential_id: ownerA } satisfies components['schemas']['AdminVirtualBucketPolicyScope']
  const scopeB = { kind: 'virtual', bucket_id: virtualB, bucket: 'shared-alias', credential_id: ownerB } satisfies components['schemas']['AdminVirtualBucketPolicyScope']
  const details = new Map<string, BucketDetail>([
    ['/admin/ui/bucket-policies/direct/shared-alias', { policy: { scope: directScope, revision: 1, updated_at: timestamp, review_token: 'd'.repeat(64) }, document: allowDocument }],
    [`/admin/ui/bucket-policies/virtual/${virtualA}`, { policy: { scope: scopeA, revision: 2, updated_at: timestamp, review_token: 'a'.repeat(64) }, document: allowDocument }],
    [`/admin/ui/bucket-policies/virtual/${virtualB}`, { policy: { scope: scopeB, revision: 3, updated_at: timestamp, review_token: 'b'.repeat(64) }, document: denyDocument }],
  ])
  const requests: string[] = []
  const unexpected: string[] = []
  await page.route('**/*', async route => {
    const request = route.request()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback()
    const url = new URL(request.url())
    const path = url.pathname
    if (url.origin !== new URL(page.url()).origin) { unexpected.push(`external ${url.origin}`); return route.abort() }
    if (path === '/admin/ui/policies' && request.method() === 'GET') {
      const response = { items: [], next_after_id: null, default_page_size: 100, max_page_size: 200 } satisfies PolicyPage
      return route.fulfill({ json: response })
    }
    if (path === '/admin/ui/bucket-policies' && request.method() === 'GET') {
      const response = { items: [...details.values()].map(item => item.policy), next_after_key: null, default_page_size: 100, max_page_size: 200 } satisfies BucketPage
      return route.fulfill({ json: response })
    }
    if (path === '/admin/ui/policies/validate' && request.method() === 'POST') return route.fulfill({ json: { valid: true, violations: [], json_bytes: 128, statements: 1, compiled_bytes: 96 } satisfies components['schemas']['AdminPolicyDraftValidationResponse'] })
    if (!path.startsWith('/admin/ui/bucket-policies/')) return route.fallback()
    requests.push(`${request.method()} ${path}`)
    const current = details.get(path)
    if (!current && request.method() === 'GET') return route.fulfill({ status: 404, body: 'Bucket policy missing' })
    if (!current) { unexpected.push(`${request.method()} ${path}`); return route.abort() }
    if (request.method() === 'GET') return route.fulfill({ json: current })
    expect(request.headers()['x-csrf-token']).toBe('synthetic-csrf')
    const body = request.postDataJSON()
    expect(body.expected_review_token).toBe(current.policy.review_token)
    if (request.method() === 'PUT') {
      const revision = current.policy.revision + 1
      const updated = { policy: { ...current.policy, revision, review_token: revision.toString(16).padStart(64, '0') }, document: body.document } satisfies BucketDetail
      details.set(path, updated)
      return route.fulfill({ json: { changed: true, deleted: false, detail: updated } satisfies components['schemas']['AdminBucketPolicyMutationResult'] })
    }
    if (request.method() === 'DELETE') { details.delete(path); return route.fulfill({ json: { changed: true, deleted: true, detail: null } satisfies components['schemas']['AdminBucketPolicyMutationResult'] }) }
    unexpected.push(`${request.method()} ${path}`); return route.abort()
  })
  return { requests, verify() { expect(unexpected).toEqual([]); verifyControl() } }
}

test('UI075-03 direct/virtual owner scopes isolate aliases and reviewed mutations stay metadata-only', async ({ page }) => {
  const state = await bucketFixture(page)
  await openPolicies(page)
  await page.getByRole('tab', { name: 'Bucket policies' }).click()
  await expect(page.getByText('Direct global bucket: shared-alias')).toBeVisible()
  await page.getByRole('button', { name: 'View Direct global bucket: shared-alias' }).click()
  await expect(page.getByRole('region', { name: 'Bucket policy detail' })).toContainText('direct')
  await page.getByRole('button', { name: 'Edit policy' }).click()
  await page.getByRole('dialog').or(page.getByRole('alertdialog')).getByLabel('Policy document').fill(JSON.stringify(denyDocument))
  await page.getByRole('dialog').or(page.getByRole('alertdialog')).getByRole('button', { name: 'Review change' }).click()
  await page.getByRole('dialog').or(page.getByRole('alertdialog')).getByRole('button', { name: 'Confirm change' }).click()
  await page.getByRole('button', { name: 'Virtual scoped' }).click()
  await expect(page.getByText(`Virtual bucket: shared-alias (${virtualA})`)).toBeVisible()
  await expect(page.getByText(`Virtual bucket: shared-alias (${virtualB})`)).toBeVisible()
  await page.getByRole('button', { name: `View Virtual bucket: shared-alias (${virtualB})` }).click()
  const region = page.getByRole('region', { name: 'Bucket policy detail' })
  await expect(region).toContainText(ownerB)
  await expect(region).toContainText(virtualB)
  await page.getByRole('button', { name: 'Delete policy' }).click()
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText('exact virtual scope')
  await page.getByRole('dialog').or(page.getByRole('alertdialog')).getByRole('button', { name: 'Review change' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: /^Delete / }).click()
  expect(state.requests.some(request => request === 'PUT /admin/ui/bucket-policies/direct/shared-alias')).toBe(true)
  expect(state.requests.some(request => request === `DELETE /admin/ui/bucket-policies/virtual/${virtualB}`)).toBe(true)
  await assertBrowserBoundary(page)
  state.verify()
})

async function diagnosticsFixture(page: Page) {
  const verifyControl = await mockControlApi(page)
  let simulationFailure = false
  let preflightFailure = false
  const effects: SimulationEffect[] = ['Allow', 'ExplicitDeny', 'ImplicitDeny']
  const requests: components['schemas']['AdminPolicySimulationRequest'][] = []
  const unexpected: string[] = []
  await page.route('**/*', async route => {
    const request = route.request()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.fallback()
    const url = new URL(request.url())
    const path = url.pathname
    if (url.origin !== new URL(page.url()).origin) { unexpected.push(`external ${url.origin}`); return route.abort() }
    if (path === '/admin/ui/policies' && request.method() === 'GET') {
      const response = { items: [], next_after_id: null, default_page_size: 100, max_page_size: 200 } satisfies PolicyPage
      return route.fulfill({ json: response })
    }
    if (path === '/admin/ui/identity-pages' && request.method() === 'GET') {
      const response = { items: [{ ...collections['/admin/ui/identities'].items[0], credential_id: ownerA, s3_access_key: 'policy-owner' }], next_after_id: null, default_page_size: 100, max_page_size: 200 } satisfies components['schemas']['IdentityProjectionPage']
      return route.fulfill({ json: response })
    }
    if (path === '/admin/ui/policies/preflight' && request.method() === 'GET') {
      if (preflightFailure) { preflightFailure = false; return route.fulfill({ status: 503, body: 'Persisted policy dependency unavailable' }) }
      const response = { items: [{ kind: 'managed_policy', stable_id: editableId, name: 'ReportsRead', reasons: ['compiled policy exceeds guardrail'] }], returned: 1, truncated: true, limit: 100 } satisfies components['schemas']['AdminPolicyPreflightResponse']
      return route.fulfill({ json: response })
    }
    if (path === '/admin/ui/policies/simulate' && request.method() === 'POST') {
      const body = request.postDataJSON() as components['schemas']['AdminPolicySimulationRequest']
      requests.push(body)
      if (simulationFailure) { simulationFailure = false; return route.fulfill({ status: 503, body: 'Malformed persisted policy dependency' }) }
      const effect = effects[Math.min(requests.length - 1, effects.length - 1)]
      const response = { allowed: effect === 'Allow', effect, matched_sid: effect === 'ImplicitDeny' ? null : effect === 'Allow' ? 'AllowRead' : 'DenyDelete', evaluated_policies: 3 } satisfies components['schemas']['AdminPolicySimulationResponse']
      return route.fulfill({ json: response })
    }
    return route.fallback()
  })
  return { requests, failSimulation() { simulationFailure = true }, failPreflight() { preflightFailure = true }, verify() { expect(unexpected).toEqual([]); verifyControl() } }
}

test('UI075-04 bounded preflight and simulator decisions fail closed then retry/recover', async ({ page }) => {
  const state = await diagnosticsFixture(page)
  await openPolicies(page)
  await page.getByRole('tab', { name: 'Diagnostics' }).click()
  state.failPreflight()
  await page.getByRole('button', { name: 'Run preflight' }).click()
  await expect(page.getByRole('alert')).toContainText('The control service is temporarily unavailable')
  await page.getByRole('alert').getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Returned 1 of limit 100' })).toContainText('truncated')
  await expect(page.getByText('compiled policy exceeds guardrail')).toBeVisible()
  const simulator = page.getByRole('region', { name: 'Identity policy simulator' })
  await simulator.getByRole('combobox').selectOption(ownerA)
  await page.getByLabel('S3 action').fill('not-an-s3-action')
  await page.getByRole('button', { name: 'Simulate' }).click()
  await expect(page.getByRole('alert')).toContainText('Action must be an S3 action')
  expect(state.requests).toHaveLength(0)
  await page.getByLabel('S3 action').fill('s3:GetObject')
  await page.getByRole('button', { name: 'Simulate' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Allowed' })).toContainText('Matched statement: AllowRead')
  await page.getByRole('button', { name: 'Simulate' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Explicit deny' })).toContainText('Matched statement: DenyDelete')
  await page.getByRole('button', { name: 'Simulate' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Implicit deny' })).toContainText('No matching statement ID')
  state.failSimulation()
  await page.getByRole('button', { name: 'Simulate' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Simulation failed closed')
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Implicit deny' })).toContainText('3 persisted policies evaluated')
  expect(state.requests.every(request => request.credential_id === ownerA && request.resource === 'arn:aws:s3:::bucket/key')).toBe(true)
  await assertBrowserBoundary(page)
  state.verify()
})