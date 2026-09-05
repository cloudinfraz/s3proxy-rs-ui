import { expect, type Page } from '@playwright/test'
import type { components } from '../src/api/schema'

const timestamp = '2026-09-05T00:00:00Z'
const fixtureId = '00000000-0000-4000-8000-000000000001'

export const collections = {
  '/admin/credentials': {
    count: 1,
    items: [{ credential_id: fixtureId, s3_access_key: 'fixture-access', azure_account: 'fixtureaccount', access_mode: 'direct', use_managed_identity: true, versioning_enabled: false, default_backend_id: null }],
  } satisfies components['schemas']['CredentialListResponse'],
  '/admin/policies': {
    count: 1,
    items: [{ id: fixtureId, name: 'fixture-policy', document: { Version: '2012-10-17', Statement: [] }, description: null, created_at: timestamp, updated_at: timestamp }],
  } satisfies components['schemas']['PolicyListResponse'],
  '/admin/backends': [
    { id: fixtureId, name: 'fixture-backend', azure_account: 'fixtureaccount', auth_mode: 'managed_identity', managed_identity_client_id: null, user_delegation_sas_enabled: false, has_secret_ref: false, region_label: null, enabled: true },
  ] satisfies components['schemas']['StorageBackendList'],
  '/admin/virtual-buckets': [
    { id: fixtureId, virtual_bucket_name: 'fixture-bucket', azure_container: 'fixturecontainer', credential_id: fixtureId, backend_id: null, endpoint_prefix: null, enabled: true },
  ] satisfies components['schemas']['VirtualBucketList'],
  '/admin/api-keys': [
    { id: fixtureId, key_name: 'fixture-admin', description: null, enabled: true, created_at: timestamp, last_used_at: null, expires_at: null, created_by: null, status: 'active' },
  ] satisfies components['schemas']['AdminApiKeyList'],
}

export const emptyCollections = {
  '/admin/credentials': { count: 0, items: [] },
  '/admin/policies': { count: 0, items: [] },
  '/admin/backends': [],
  '/admin/virtual-buckets': [],
  '/admin/api-keys': [],
} satisfies { [Path in keyof typeof collections]: (typeof collections)[Path] }

export async function mockControlApi(page: Page, empty = false) {
  const unexpected: string[] = []
  await page.route('**/admin/**', async route => {
    const request = route.request()
    if (request.isNavigationRequest()) return route.continue()
    const path = new URL(request.url()).pathname
    if (path.startsWith('/admin/ui/')) return route.continue()
    if (request.method() === 'GET' && path in collections) {
      const selected = empty ? emptyCollections : collections
      return route.fulfill({ json: selected[path as keyof typeof collections] })
    }
    if (path === '/admin/session' && request.method() === 'GET') {
      const session = { authenticated: true, csrf_token: 'synthetic-csrf', expires_at: '2099-01-01T00:00:00Z' } satisfies components['schemas']['SessionResponse']
      return route.fulfill({ json: session })
    }
    if (path === '/admin/health' && request.method() === 'GET') {
      const health = {
        status: 'healthy', version: 'test', timestamp,
        cache: { mode: 'memory', available: true, redis_connected: false },
        credentials: { count: empty ? 0 : 1 },
        multipart: { store_type: 'memory-only', redis_available: false, persistence: 'disabled', warning: 'State lost on restart' },
        authorization: { mode: 'off', coherence: 'strict', resolver_ready: false, database_ready: false, audit_required: false, audit_dispatcher_ready: false },
      } satisfies components['schemas']['AdminHealthResponse']
      return route.fulfill({ json: health })
    }
    unexpected.push(`${request.method()} ${path}`)
    return route.abort()
  })
  return () => expect(unexpected).toEqual([])
}

export async function navigateTo(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('link', { name: label, exact: true }).click()
}