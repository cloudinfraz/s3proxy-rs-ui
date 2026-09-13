/// <reference types="node" />

import { devices, expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import type { components } from '../../src/api/schema'

let adminKey = ''
let ownsAdminKey = false
const keyName = `ui-live-${randomUUID()}`
const browserOrigin = new URL(process.env.UI_E2E_BASE_URL ?? 'http://127.0.0.1:4174').origin
const controlOrigin = new URL(process.env.UI_E2E_CONTROL_BASE_URL ?? browserOrigin).origin
const defaultS3Endpoint = 'http://127.0.0.1:8080'

type S3Credentials = { accessKey: string; secretKey: string }

function requireSuccess(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function login(page: Page) {
  await page.goto('/admin/ui/login')
  await page.getByLabel('Admin API key').fill(adminKey)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
}

function hmac(key: string | Uint8Array, value: string) {
  return createHmac('sha256', key).update(value).digest()
}

function signedListBucketsHeaders(endpoint: string, credentials: S3Credentials) {
  const target = new URL(endpoint)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = amzDate.slice(0, 8)
  const payloadHash = createHash('sha256').update('').digest('hex')
  const canonicalHeaders = `host:${target.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = `GET\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`
  const scope = `${date}/us-east-1/s3/aws4_request`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`
  const dateKey = hmac(`AWS4${credentials.secretKey}`, date)
  const regionKey = hmac(dateKey, 'us-east-1')
  const serviceKey = hmac(regionKey, 's3')
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
}

async function listBuckets(request: APIRequestContext, endpoint: string, credentials: S3Credentials) {
  const target = new URL(endpoint)
  target.pathname = '/'
  target.search = ''
  return request.get(target.toString(), { headers: signedListBucketsHeaders(target.toString(), credentials) })
}

async function cleanupRunResources(accessKey: string | null, policyName: string | null) {
  const request = (url: string) => fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${adminKey}` }, signal: AbortSignal.timeout(10_000) })
  const failures: string[] = []
  if (accessKey) {
    const credential = await request(`${controlOrigin}/admin/credentials/${encodeURIComponent(accessKey)}`)
    if (credential.status !== 204 && credential.status !== 404) failures.push('identity')
  }
  if (policyName) {
    const policy = await request(`${controlOrigin}/admin/policies/${encodeURIComponent(policyName)}`)
    if (policy.status !== 204 && policy.status !== 404) failures.push('policy')
  }
  requireSuccess(failures.length === 0, `Run-owned ${failures.join(' and ')} cleanup failed`)
}

test.beforeAll(async () => {
  const providedAdminKey = process.env.UI_E2E_ADMIN_KEY
  if (process.env.UI_E2E_BASE_URL) {
    requireSuccess(process.env.UI_E2E_REMOTE_MUTATION_ALLOWED === '1', 'Explicit remote dev mutation opt-in is required')
    requireSuccess(typeof providedAdminKey === 'string' && providedAdminKey.length > 0, 'Remote live verification requires an injected admin key')
    adminKey = providedAdminKey
    return
  }
  requireSuccess(process.env.UI_E2E_DISPOSABLE === '1', 'Explicit disposable local UI E2E opt-in is required')
  const response = await fetch(`${controlOrigin}/admin/bootstrap/api-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key_name: keyName, created_by: 'ui-live-test' }),
  })
  requireSuccess(response.status === 200, 'Bootstrap requires a fresh disposable local database')
  const issued = await response.json() as components['schemas']['BootstrapAdminKeyResponse']
  requireSuccess(typeof issued.api_key === 'string' && issued.api_key.length > 0, 'Bootstrap did not issue a key')
  adminKey = issued.api_key
  ownsAdminKey = true
})

test.afterAll(async () => {
  if (!adminKey || !ownsAdminKey) return
  try {
    const response = await fetch(`${controlOrigin}/admin/api-keys/${encodeURIComponent(keyName)}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${adminKey}` },
    })
    requireSuccess(response.status === 204, 'Run-owned admin key cleanup failed')
  } finally {
    adminKey = ''
    ownsAdminKey = false
  }
})

for (const [viewport, device] of [['desktop', devices['Desktop Chrome']], ['mobile', devices['Pixel 7']]] as const) {
  test.describe(viewport, () => {
    test.use({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: device.deviceScaleFactor, userAgent: device.userAgent })
    test('UI068-LIVE real login, contract reads, validation errors and logout', async ({ page }) => {
      let stage = 'anonymous rejection'
      try {
        const anonymous = await fetch(`${controlOrigin}/admin/capabilities`)
        requireSuccess(anonymous.status === 403, 'Anonymous capabilities must be rejected')
        requireSuccess(anonymous.headers.get('content-type')?.startsWith('application/xml') === true, 'Authentication error must be XML')
        stage = 'browser login'
        await page.goto('/admin/ui/login')
        await page.getByLabel('Admin API key').fill(adminKey)
        const loginResponse = page.waitForResponse(response => response.url().endsWith('/admin/session/login') && response.request().method() === 'POST')
        await page.getByRole('button', { name: 'Continue' }).click()
        const loginStatus = (await loginResponse).status()
        const hasSessionCookie = (await page.context().cookies()).some(cookie => cookie.name === '__Host-s3proxy_session')
        stage = `browser login (HTTP ${loginStatus}, session cookie ${hasSessionCookie ? 'present' : 'absent'})`
        requireSuccess(loginStatus === 200 && hasSessionCookie, 'Login must establish a browser session')
        await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

        stage = 'live operations navigation'
        for (const title of ['Audit', 'Health', 'Admin keys', 'Overview']) {
          const menu = page.getByRole('button', { name: 'Open navigation' })
          if (await menu.isVisible()) await menu.click()
          await page.getByRole('navigation', { name: 'Control navigation' }).getByRole('link', { name: title, exact: true }).click()
          await expect(page.getByRole('dialog')).toHaveCount(0)
          await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
          requireSuccess(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Live operations layout overflowed')
        }

        stage = 'authenticated contract reads and logout'
        const result = await page.evaluate(async () => {
          const read = async (path: string) => {
            const response = await fetch(path)
            if (!response.ok) throw new Error('Authenticated read failed')
            return response.json()
          }
          const capabilities = await read('/admin/capabilities')
          const health = await read('/admin/health')
          const preflight = await read('/admin/policies/preflight')
          const credentials = await read('/admin/credentials')
          const policies = await read('/admin/policies')
          const keys = await read('/admin/api-keys')
          const session = await read('/admin/session')
          const invalid = await fetch('/admin/policies', {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrf_token }, body: '{}',
          })
          const denied = await fetch('/admin/policies', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
          })
          const logout = await fetch('/admin/session', {
            method: 'DELETE', headers: { 'x-csrf-token': session.csrf_token },
          })
          const revoked = await fetch('/admin/capabilities')
          return {
            capabilityKeys: Object.keys(capabilities).sort(),
            endpointsPresent: ['public_sts_endpoint', 'public_s3_endpoint'].every(key => key in capabilities && (capabilities[key] === null || typeof capabilities[key] === 'string')),
            healthTyped: typeof health.cache.available === 'boolean' && typeof health.credentials.count === 'number' && typeof health.authorization.resolver_ready === 'boolean' && typeof health.database?.schema_valid === 'boolean',
            preflightTyped: Array.isArray(preflight.items) && preflight.count === preflight.items.length && typeof preflight.limits.max_policy_bytes === 'number',
            collectionsTyped: Array.isArray(credentials.items) && credentials.count === credentials.items.length && Array.isArray(policies.items) && policies.count === policies.items.length && Array.isArray(keys) && keys.every(key => typeof key.status === 'string'),
            invalidStatus: invalid.status, invalidType: invalid.headers.get('content-type'),
            deniedStatus: denied.status, deniedType: denied.headers.get('content-type'),
            logoutStatus: logout.status, revokedStatus: revoked.status,
            storageEmpty: localStorage.length === 0 && sessionStorage.length === 0,
          }
        })
        stage = 'contract assertions'
        expect(result.capabilityKeys).toEqual(['assume_role_ready', 'authz_mode', 'backend_routing_enabled', 'iam_account_configured', 'iam_assume_role_enabled', 'legacy_routing_available', 'plane', 'public_s3_endpoint', 'public_sts_endpoint', 'sts_enabled', 'usable_registry_auth_modes'])
        requireSuccess(result.endpointsPresent && result.healthTyped && result.preflightTyped && result.collectionsTyped, 'Live contract fields did not match required shapes')
        requireSuccess(result.invalidStatus === 422 && result.invalidType?.startsWith('text/plain') === true, 'Extractor validation must return plain text 422')
        requireSuccess(result.deniedStatus === 403 && result.deniedType?.startsWith('application/xml') === true, 'Missing CSRF must return XML 403')
        requireSuccess(result.logoutStatus === 204 && result.revokedStatus === 403 && result.storageEmpty, 'Logout or browser storage safety failed')
        stage = 'revoked session navigation'
        const sessionCheck = page.waitForResponse(response => response.url().endsWith('/admin/session') && response.request().method() === 'GET')
        const refreshedPage = await page.reload()
        stage = `revoked session navigation (page HTTP ${refreshedPage?.status()})`
        requireSuccess(refreshedPage?.status() === 200, 'Overview must load on a full page reload')
        const sessionStatus = (await sessionCheck).status()
        stage = `revoked session navigation (session HTTP ${sessionStatus})`
        requireSuccess(sessionStatus === 403, 'Revoked session must be rejected after reload')
        await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      } catch {
        throw new Error(`Live control UI failed at ${stage}; secret-bearing diagnostics suppressed`)
      }
    })

    test('UI077-LIVE UI policy changes reach the S3 authorization data plane', async ({ page, request }) => {
      test.setTimeout(120_000)
      const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
      const azureAccount = `uilive${suffix}`.slice(0, 24)
      const bucketName = `ui-live-${suffix}`
      const containerName = `ui-live-${suffix}`
      const policyName = `UiLive${suffix}`
      const s3Endpoint = process.env.UI_E2E_S3_ENDPOINT ?? defaultS3Endpoint
      const allowDocument = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 's3:ListAllMyBuckets', Resource: 'arn:aws:s3:::*' }] })
      const denyDocument = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Deny', Action: 's3:ListAllMyBuckets', Resource: 'arn:aws:s3:::*' }] })
      let credentialId: string | null = null
      let accessKey: string | null = null
      let secretKey: string | null = null
      let policyCreated = false
      let stage = 'login'
      let workflowFailure: Error | null = null

      try {
        await login(page)
        stage = 'authorization enforcement precondition'
        const authzMode = await page.evaluate(async () => {
          const response = await fetch('/admin/capabilities')
          if (!response.ok) throw new Error('Capabilities unavailable')
          return (await response.json() as { authz_mode?: unknown }).authz_mode
        })
        requireSuccess(authzMode === 'enforce', 'Live data-plane verification requires authz_mode=enforce')

        stage = 'virtual identity creation'
        await page.goto('/admin/ui/credentials?create=virtual&return=buckets')
        const identityDialog = page.getByRole('dialog', { name: 'Create S3 identity' })
        await identityDialog.getByLabel('Azure account').fill(azureAccount)
        const identityResponsePromise = page.waitForResponse(response => response.url().endsWith('/admin/credentials') && response.request().method() === 'POST')
        await identityDialog.getByRole('button', { name: 'Create identity' }).click()
        const identityResponse = await identityResponsePromise
        stage = `virtual identity creation (HTTP ${identityResponse.status()})`
        requireSuccess(identityResponse.status() === 201, 'Virtual identity creation failed')
        const identityBody = await identityResponse.json() as { credential_id?: unknown; s3_access_key?: unknown; s3_secret_key?: unknown }
        requireSuccess(typeof identityBody.credential_id === 'string' && identityBody.credential_id.length > 0, 'Identity creation did not return a stable credential ID')
        credentialId = identityBody.credential_id
        const credentialsDialog = page.getByRole('dialog', { name: 'One-time S3 credentials' })
        await expect(credentialsDialog).toBeVisible()
        accessKey = (await credentialsDialog.locator('label').filter({ hasText: 'Access key' }).locator('code').textContent())?.trim() ?? null
        secretKey = (await credentialsDialog.locator('label').filter({ hasText: 'Secret key' }).locator('code').textContent())?.trim() ?? null
        requireSuccess(accessKey !== null && accessKey.length > 0 && secretKey !== null && secretKey.length > 0, 'Identity creation did not return one-time S3 credentials')
        requireSuccess(accessKey === identityBody.s3_access_key && secretKey === identityBody.s3_secret_key, 'Rendered S3 credentials did not match the backend response')
        await credentialsDialog.getByRole('button', { name: 'I stored these securely; continue' }).click()

        stage = 'virtual bucket mapping creation'
        const mappingDialog = page.getByRole('dialog', { name: 'Add bucket routing' })
        await expect(mappingDialog).toBeVisible()
        await mappingDialog.getByLabel('S3 bucket').fill(bucketName)
        await mappingDialog.getByLabel('Azure container').fill(containerName)
        await mappingDialog.getByRole('button', { name: 'Review changes' }).click()
        stage = 'virtual bucket mapping request dispatch'
        const reviewedMappingDialog = page.getByRole('dialog', { name: 'Confirm mapping change' })
        await expect(reviewedMappingDialog).toBeVisible()
        const [mappingRequest] = await Promise.all([
          page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.includes('virtual-buckets')),
          reviewedMappingDialog.getByRole('button', { name: 'Confirm change' }).click(),
        ])
        const mappingPath = new URL(mappingRequest.url()).pathname
        stage = `virtual bucket mapping response for ${mappingPath}`
        const mappingResponse = await page.waitForResponse(response => response.request() === mappingRequest)
        const mappingStatus = mappingResponse.status()
        stage = `virtual bucket mapping creation ${mappingPath} (HTTP ${mappingStatus})`
        requireSuccess(mappingStatus === 201, 'Virtual bucket mapping creation failed')
        stage = 'virtual bucket mapping list refresh'
        await expect(page.getByRole('button', { name: `Edit ${bucketName}` })).toBeVisible()

        stage = 'managed allow policy creation'
        await page.goto(`/admin/ui/policies?view=identity&credential_id=${encodeURIComponent(credentialId)}`)
        await page.getByRole('button', { name: 'Create policy' }).click()
        let policyDialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
        await policyDialog.getByLabel('Policy name').fill(policyName)
        await policyDialog.getByLabel('Description').fill('Live UI data-plane verification')
        await policyDialog.getByLabel('Policy document').fill(allowDocument)
        await policyDialog.getByRole('button', { name: 'Review change' }).click()
        await policyDialog.getByRole('button', { name: 'Confirm change' }).click()
        await expect(page.getByRole('region', { name: 'Managed policy detail' })).toContainText(policyName)
        policyCreated = true
        await page.getByRole('button', { name: 'Close dialog' }).click()

        stage = 'identity policy attachment view'
        const attachments = page.getByRole('region', { name: 'Identity attachments' })
        stage = 'identity policy identity selection'
        const identitySelector = attachments.getByLabel('Identity')
        await expect(identitySelector).toHaveValue(credentialId)
        const identityOptionState = async () => identitySelector.locator('option').evaluateAll((options, expected) => ({
          count: options.length,
          matched: options.some(option => (option as HTMLOptionElement).value === expected),
          disabled: options.some(option => (option as HTMLOptionElement).value === expected && (option as HTMLOptionElement).disabled),
        }), credentialId)
        const optionState = await identityOptionState()
        stage = `identity policy identity selection (options ${optionState.count}, matched ${optionState.matched}, disabled ${optionState.disabled})`
        requireSuccess(optionState.matched && !optionState.disabled, 'Created identity is not selectable for policy attachment')
        stage = 'identity policy policy selection'
        await attachments.getByLabel('Managed policy').selectOption({ label: policyName })
        stage = 'identity policy attachment review'
        await attachments.getByRole('button', { name: 'Review attachment' }).click()
        stage = 'identity policy attachment commit'
        const attachmentDialog = page.getByRole('dialog', { name: 'Confirm: attach policy' })
        await expect(attachmentDialog).toBeVisible()
        const [attachmentResponse] = await Promise.all([
          page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/policies')),
          attachmentDialog.getByRole('button', { name: 'Attach policy' }).click(),
        ])
        stage = `identity policy attachment commit (HTTP ${attachmentResponse.status()})`
        requireSuccess(attachmentResponse.status() === 200, 'Identity policy attachment failed')
        stage = 'identity policy attachment list refresh'
        await expect(page.getByRole('button', { name: `Detach ${policyName}` })).toBeVisible()

        const credentials = { accessKey, secretKey }
        stage = 'allowed signed S3 request'
        await expect.poll(async () => {
          const response = await listBuckets(request, s3Endpoint, credentials)
          return response.status() === 200 && (await response.text()).includes(`<Name>${bucketName}</Name>`)
        }, { timeout: 10_000, message: 'Attached allow policy did not reach the S3 data plane' }).toBe(true)

        stage = 'managed policy replacement with explicit deny'
        await page.getByRole('tab', { name: 'Managed policies' }).click()
        await page.getByRole('button', { name: `View ${policyName}` }).click()
        await page.getByRole('button', { name: 'Edit policy' }).click()
        policyDialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
        await policyDialog.getByLabel('Policy document').fill(denyDocument)
        await policyDialog.getByRole('button', { name: 'Review change' }).click()
        await policyDialog.getByRole('button', { name: 'Confirm change' }).click()
        await expect(page.getByRole('region', { name: 'Managed policy detail' })).toContainText('Deny')

        stage = 'denied signed S3 request'
        await expect.poll(async () => (await listBuckets(request, s3Endpoint, credentials)).status(), {
          timeout: 10_000,
          message: 'Explicit deny policy did not reach the S3 data plane',
        }).toBe(403)
        const denied = await listBuckets(request, s3Endpoint, credentials)
        requireSuccess((await denied.text()).includes('<Code>AccessDenied</Code>'), 'Denied S3 response did not contain AccessDenied')

        stage = 'managed allow policy restoration'
        await page.getByRole('button', { name: 'Edit policy' }).click()
        policyDialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
        await policyDialog.getByLabel('Policy document').fill(allowDocument)
        await policyDialog.getByRole('button', { name: 'Review change' }).click()
        await policyDialog.getByRole('button', { name: 'Confirm change' }).click()
        await expect.poll(async () => (await listBuckets(request, s3Endpoint, credentials)).status(), { timeout: 10_000 }).toBe(200)

        stage = 'virtual bucket mapping disable'
        await page.goto('/admin/ui/buckets')
        await page.getByRole('button', { name: `Edit ${bucketName}` }).click()
        let mappingEdit = page.getByRole('dialog', { name: 'Edit mapping' })
        await mappingEdit.getByLabel('Enabled', { exact: true }).uncheck()
        await mappingEdit.getByRole('button', { name: 'Review changes' }).click()
        await mappingEdit.getByRole('button', { name: 'Confirm change' }).click()
        await expect.poll(async () => {
          const response = await listBuckets(request, s3Endpoint, credentials)
          return response.status() === 200 && !(await response.text()).includes(`<Name>${bucketName}</Name>`)
        }, { timeout: 10_000 }).toBe(true)

        stage = 'virtual bucket mapping re-enable'
        await page.getByRole('button', { name: `Edit ${bucketName}` }).click()
        mappingEdit = page.getByRole('dialog', { name: 'Edit mapping' })
        await mappingEdit.getByLabel('Enabled', { exact: true }).check()
        await mappingEdit.getByRole('button', { name: 'Review changes' }).click()
        await mappingEdit.getByRole('button', { name: 'Confirm change' }).click()
        await expect.poll(async () => {
          const response = await listBuckets(request, s3Endpoint, credentials)
          return response.status() === 200 && (await response.text()).includes(`<Name>${bucketName}</Name>`)
        }, { timeout: 10_000 }).toBe(true)

        stage = 'identity secret rotation'
        await page.goto('/admin/ui/credentials')
        await page.getByRole('button', { name: `Rotate ${accessKey}` }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: `Rotate ${accessKey}` }).click()
        const rotatedDialog = page.getByRole('dialog', { name: 'One-time S3 credentials' })
        await expect(rotatedDialog).toBeVisible()
        const rotatedSecret = (await rotatedDialog.locator('label').filter({ hasText: 'Secret key' }).locator('code').textContent())?.trim() ?? null
        requireSuccess(rotatedSecret !== null && rotatedSecret.length > 0, 'Secret rotation did not return a new secret')
        await rotatedDialog.getByRole('button', { name: /stored securely/i }).click()
        await expect.poll(async () => (await listBuckets(request, s3Endpoint, credentials)).status(), { timeout: 10_000 }).toBe(403)
        secretKey = rotatedSecret
        const rotatedCredentials = { accessKey, secretKey }
        await expect.poll(async () => (await listBuckets(request, s3Endpoint, rotatedCredentials)).status(), { timeout: 10_000 }).toBe(200)

        stage = 'identity disable'
        await page.getByRole('button', { name: `Edit ${accessKey}` }).click()
        let identityEdit = page.getByRole('dialog', { name: 'Edit identity' })
        await identityEdit.getByLabel('Enabled', { exact: true }).uncheck()
        await identityEdit.getByRole('button', { name: 'Save' }).click()
        await expect.poll(async () => (await listBuckets(request, s3Endpoint, rotatedCredentials)).status(), { timeout: 10_000 }).toBe(403)

        stage = 'identity re-enable'
        await page.getByRole('button', { name: `Edit ${accessKey}` }).click()
        identityEdit = page.getByRole('dialog', { name: 'Edit identity' })
        await identityEdit.getByLabel('Enabled', { exact: true }).check()
        await identityEdit.getByRole('button', { name: 'Save' }).click()
        await expect.poll(async () => (await listBuckets(request, s3Endpoint, rotatedCredentials)).status(), { timeout: 10_000 }).toBe(200)

        stage = 'identity policy detach'
        await page.goto(`/admin/ui/policies?view=identity&credential_id=${encodeURIComponent(credentialId)}`)
        const lifecycleAttachments = page.getByRole('region', { name: 'Identity attachments' })
        await lifecycleAttachments.getByLabel('Identity').selectOption(credentialId)
        await lifecycleAttachments.getByRole('button', { name: `Detach ${policyName}` }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: `Detach ${policyName}` }).click()
        await expect.poll(async () => (await listBuckets(request, s3Endpoint, rotatedCredentials)).status(), { timeout: 10_000 }).toBe(403)

        stage = 'identity policy reattach'
        await lifecycleAttachments.getByLabel('Managed policy').selectOption({ label: policyName })
        await lifecycleAttachments.getByRole('button', { name: 'Review attachment' }).click()
        await page.getByRole('dialog').getByRole('button', { name: 'Attach policy' }).click()
        await expect.poll(async () => (await listBuckets(request, s3Endpoint, rotatedCredentials)).status(), { timeout: 10_000 }).toBe(200)
      } catch {
        workflowFailure = new Error(`Live UI data-plane workflow failed at ${stage}; secret-bearing diagnostics suppressed`)
      } finally {
        secretKey = null
        try {
          await cleanupRunResources(accessKey, policyCreated ? policyName : null)
        } catch {
          const cleanupFailure = new Error('Live UI data-plane cleanup failed; secret-bearing diagnostics suppressed')
          if (!workflowFailure) workflowFailure = cleanupFailure
        }
        accessKey = null
        credentialId = null
      }
      if (workflowFailure) throw workflowFailure
    })

    test('UI078-LIVE admin key create, disable, enable and delete reach the backend', async ({ page, request }) => {
      test.setTimeout(60_000)
      const keyName = `ui-live-admin-${randomUUID().replace(/-/g, '').slice(0, 12)}`
      let issuedKey: string | null = null
      let stage = 'login'
      let workflowFailure: Error | null = null
      try {
        await login(page)
        stage = 'admin key creation'
        await page.goto('/admin/ui/keys')
        await page.getByRole('button', { name: 'Create admin key' }).click()
        const createDialog = page.getByRole('dialog', { name: 'Create admin key' })
        await createDialog.getByLabel('Name').fill(keyName)
        await createDialog.getByLabel('Description').fill('Live UI lifecycle verification')
        await createDialog.getByLabel('Expires in days').fill('1')
        const createResponse = page.waitForResponse(response => response.url().endsWith('/admin/api-keys') && response.request().method() === 'POST')
        await createDialog.getByRole('button', { name: 'Create key' }).click()
        const createdResponse = await createResponse
        const createStatus = createdResponse.status()
        stage = `admin key creation (HTTP ${createStatus})`
        requireSuccess(createStatus === 201, 'Admin key creation failed')
        const createdBody = await createdResponse.json() as { api_key?: unknown; key_name?: unknown }
        requireSuccess(typeof createdBody.api_key === 'string' && createdBody.api_key.length > 0 && createdBody.key_name === keyName, 'Admin key creation returned an invalid response')
        issuedKey = createdBody.api_key
        stage = 'admin key one-time dialog'
        const keyDialog = page.getByRole('dialog').or(page.getByRole('alertdialog')).filter({ hasText: 'One-time admin key' })
        await expect(keyDialog).toContainText(issuedKey)
        stage = 'admin key acknowledgement'
        await page.getByRole('button', { name: 'I have stored this securely', exact: true }).click()
        stage = 'admin key list refresh'
        await expect(page.getByRole('button', { name: `Disable ${keyName}`, exact: true })).toBeVisible()

        const adminStatus = async () => (await request.get(`${controlOrigin}/admin/health`, { headers: { authorization: `Bearer ${issuedKey}` } })).status()
        stage = 'created admin key authentication'
        await expect.poll(adminStatus, { timeout: 10_000 }).toBe(200)

        stage = 'admin key disable'
        await page.getByRole('button', { name: `Disable ${keyName}` }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: `Disable ${keyName}` }).click()
        await expect.poll(adminStatus, { timeout: 10_000 }).toBe(403)

        stage = 'admin key enable'
        await page.getByRole('button', { name: `Enable ${keyName}` }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: `Enable ${keyName}` }).click()
        await expect.poll(adminStatus, { timeout: 10_000 }).toBe(200)

        stage = 'admin key deletion'
        await page.getByRole('button', { name: `Delete ${keyName}` }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: `Delete ${keyName}` }).click()
        await expect.poll(adminStatus, { timeout: 10_000 }).toBe(403)
        issuedKey = null
      } catch {
        workflowFailure = new Error(`Live admin key workflow failed at ${stage}; secret-bearing diagnostics suppressed`)
      } finally {
        if (issuedKey) {
          const cleanup = await fetch(`${controlOrigin}/admin/api-keys/${encodeURIComponent(keyName)}`, { method: 'DELETE', headers: { authorization: `Bearer ${adminKey}` }, signal: AbortSignal.timeout(10_000) })
          if (![204, 404].includes(cleanup.status) && !workflowFailure) workflowFailure = new Error('Live admin key cleanup failed; secret-bearing diagnostics suppressed')
        }
        issuedKey = null
      }
      if (workflowFailure) throw workflowFailure
    })
  })
}