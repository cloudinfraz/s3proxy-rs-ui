import { expect, type Page } from '@playwright/test'
import type { components } from '../src/api/schema'

const timestamp = '2026-09-05T00:00:00Z'
const fixtureId = '00000000-0000-4000-8000-000000000001'

export const capabilities = { plane: 'control', authz_mode: 'off', sts_enabled: false, iam_assume_role_enabled: false, assume_role_ready: false, iam_account_configured: false, backend_routing_enabled: true, usable_registry_auth_modes: ['managed_identity'], legacy_routing_available: true, public_sts_endpoint: null, public_s3_endpoint: null } satisfies components['schemas']['ControlCapabilities']

export const health = {
  status: 'healthy', version: 'test', commit_sha: null, development: false, dirty: null, timestamp,
  cache: { mode: 'memory', available: true, redis_connected: false },
  credentials: { count: 1 },
  multipart: { store_type: 'memory-only', redis_available: false, persistence: 'disabled', warning: 'State lost on restart' },
  authorization: { mode: 'off', coherence: 'strict', resolver_ready: false, database_ready: false, audit_required: false, audit_dispatcher_ready: false },
} satisfies components['schemas']['AdminHealthResponse']

export const readiness = {
  evaluated_at: timestamp,
  status: 'ready',
  finding_count: 0,
  items: [],
  next_after_key: null,
  default_page_size: 20,
  max_page_size: 100,
} satisfies components['schemas']['ConfigurationDiagnosticsResponse']

export const collections = {
  '/admin/ui/overview': {
    identity_count: 1, bucket_routing_count: 1, backend_count: 1, policy_count: 1,
  } satisfies components['schemas']['AdminOverviewSummary'],
  '/admin/ui/virtual-buckets': {
    items: [{ id: fixtureId, virtual_bucket_name: 'fixture-bucket', azure_container: 'fixturecontainer', credential_id: fixtureId, credential_access_key: 'fixture-access', backend_id: null, endpoint_prefix: null, enabled: true, created_at: timestamp, updated_at: timestamp }],
    next_after_id: null,
  } satisfies components['schemas']['VirtualMappingPage'],
  '/admin/credentials': {
    count: 1,
    items: [{ credential_id: fixtureId, s3_access_key: 'fixture-access', azure_account: 'fixtureaccount', access_mode: 'direct', use_managed_identity: true, versioning_enabled: false, default_backend_id: null }],
  } satisfies components['schemas']['CredentialListResponse'],
  '/admin/ui/identities': {
    count: 1,
    items: [{ credential_id: fixtureId, s3_access_key: 'fixture-access', azure_account: 'fixtureaccount', access_mode: 'direct', use_managed_identity: true, versioning_enabled: false, default_backend_id: null, enabled: true, virtual_bucket_count: 1, policy_attachment_count: 1 }],
  } satisfies components['schemas']['IdentityProjectionListResponse'],
  '/admin/ui/identity-pages': {
    items: [{ credential_id: fixtureId, s3_access_key: 'fixture-access', azure_account: 'fixtureaccount', access_mode: 'direct', use_managed_identity: true, versioning_enabled: false, default_backend_id: null, enabled: true, virtual_bucket_count: 1, policy_attachment_count: 1 }],
    next_after_id: null,
    default_page_size: 100,
    max_page_size: 200,
  } satisfies components['schemas']['IdentityProjectionPage'],
  '/admin/policies': {
    count: 1,
    items: [{ id: fixtureId, name: 'fixture-policy', document: { Version: '2012-10-17', Statement: [] }, description: null, created_at: timestamp, updated_at: timestamp }],
  } satisfies components['schemas']['PolicyListResponse'],
  '/admin/ui/policies': {
    items: [{ id: fixtureId, name: 'fixture-policy', description: null, revision: 0, built_in: false, deletable: true, credential_attachment_count: 0, role_attachment_count: 0, updated_at: timestamp }],
    next_after_id: null,
    default_page_size: 100,
    max_page_size: 200,
  } satisfies components['schemas']['AdminPolicyPage'],
  '/admin/backends': [
    { id: fixtureId, name: 'fixture-backend', azure_account: 'fixtureaccount', auth_mode: 'managed_identity', managed_identity_client_id: null, user_delegation_sas_enabled: false, has_secret_ref: false, region_label: null, enabled: true },
  ] satisfies components['schemas']['StorageBackendList'],
  '/admin/ui/backends': {
    count: 1,
    items: [{ id: fixtureId, name: 'fixture-backend', azure_account: 'fixtureaccount', auth_mode: 'managed_identity', managed_identity_client_id: null, user_delegation_sas_enabled: false, has_secret_ref: false, region_label: null, enabled: true, credential_default_count: 2, virtual_bucket_count: 3, impact_token: '0123456789abcdef0123456789abcdef' }],
  } satisfies components['schemas']['StorageBackendProjectionListResponse'],
  '/admin/ui/backend-options': {
    items: [{ id: fixtureId, name: 'fixture-backend', azure_account: 'fixtureaccount', auth_mode: 'managed_identity', enabled: true }],
    next_after_id: null,
    default_page_size: 100,
    max_page_size: 200,
  } satisfies components['schemas']['StorageBackendOptionPage'],
  '/admin/virtual-buckets': [
    { id: fixtureId, virtual_bucket_name: 'fixture-bucket', azure_container: 'fixturecontainer', credential_id: fixtureId, backend_id: null, endpoint_prefix: null, enabled: true },
  ] satisfies components['schemas']['VirtualBucketList'],
  '/admin/api-keys': [
    { id: fixtureId, key_name: 'fixture-admin', description: null, enabled: true, created_at: timestamp, last_used_at: null, expires_at: null, created_by: null, status: 'active' },
  ] satisfies components['schemas']['AdminApiKeyList'],
}

export const emptyCollections = {
  '/admin/ui/overview': { identity_count: 0, bucket_routing_count: 0, backend_count: 0, policy_count: 0 },
  '/admin/ui/virtual-buckets': { items: [], next_after_id: null },
  '/admin/credentials': { count: 0, items: [] },
  '/admin/ui/identities': { count: 0, items: [] },
  '/admin/ui/identity-pages': { items: [], next_after_id: null, default_page_size: 100, max_page_size: 200 },
  '/admin/policies': { count: 0, items: [] },
  '/admin/ui/policies': { items: [], next_after_id: null, default_page_size: 100, max_page_size: 200 },
  '/admin/backends': [],
  '/admin/ui/backends': { count: 0, items: [] },
  '/admin/ui/backend-options': { items: [], next_after_id: null, default_page_size: 100, max_page_size: 200 },
  '/admin/virtual-buckets': [],
  '/admin/api-keys': [],
} satisfies { [Path in keyof typeof collections]: (typeof collections)[Path] }

export async function mockControlApi(page: Page, empty = false) {
  const unexpected: string[] = []
  await page.route('**/admin/**', async route => {
    const request = route.request()
    if (request.isNavigationRequest()) return route.continue()
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.continue()
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET' && path in collections) {
      const selected = empty ? emptyCollections : collections
      return route.fulfill({ json: selected[path as keyof typeof collections] })
    }
    if (!empty && request.method() === 'GET' && path === `/admin/ui/identities/${fixtureId}`) {
      return route.fulfill({ json: collections['/admin/ui/identities'].items[0] })
    }
    if (!empty && request.method() === 'GET' && path === `/admin/ui/backend-options/${fixtureId}`) {
      return route.fulfill({ json: collections['/admin/ui/backend-options'].items[0] })
    }
    if (path === '/admin/session' && request.method() === 'GET') {
      const session = { authenticated: true, csrf_token: 'synthetic-csrf', expires_at: '2099-01-01T00:00:00Z' } satisfies components['schemas']['SessionResponse']
      return route.fulfill({ json: session })
    }
    if (path === '/admin/health' && request.method() === 'GET') {
      return route.fulfill({ json: { ...health, credentials: { count: empty ? 0 : 1 } } })
    }
    if (path === '/admin/ui/readiness' && request.method() === 'GET') return route.fulfill({ json: readiness })
    if (path === '/admin/capabilities' && request.method() === 'GET') return route.fulfill({ json: capabilities })
    if (path === '/admin/roles' && request.method() === 'GET') return route.fulfill({ json: { count: 0, items: [] } satisfies components['schemas']['IamRoleListResponse'] })
    if (path === '/admin/ui/roles' && request.method() === 'GET') return route.fulfill({ json: { items: [], next_after_id: null, limits: { min_duration_seconds: 3600, max_duration_seconds: 43200, max_retirement_batch: 1000, retained_count_cap: 1000, default_page_size: 100, max_page_size: 200 } } satisfies components['schemas']['AdminIamRolePage'] })
    if (path === '/admin/audit' && request.method() === 'GET') return route.fulfill({ json: [] satisfies components['schemas']['AuditEventList'] })
    unexpected.push(`${request.method()} ${path}`)
    return route.abort()
  })
  return () => expect(unexpected).toEqual([])
}

export async function navigateTo(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', includeHidden: true })
  await menu.waitFor({ state: 'attached' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Control navigation' }).getByRole('link', { name: label, exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}