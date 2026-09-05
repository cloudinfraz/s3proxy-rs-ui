import { describe, expect, it } from 'vitest'
import { normalizeResourceRows } from './resources'
import type { components } from './schema'

const credential = {
  credential_id: null, s3_access_key: 'AKIA_TEST', azure_account: 'storage',
  access_mode: 'direct', use_managed_identity: true, versioning_enabled: false,
  default_backend_id: null,
} satisfies components['schemas']['CredentialSummary']
const policy = {
  id: '00000000-0000-4000-8000-000000000001', name: 'read-only', document: {},
  description: null, created_at: '2026-09-05T00:00:00Z', updated_at: '2026-09-05T00:00:00Z',
} satisfies components['schemas']['PolicyResponse']
const backend = {
  id: '00000000-0000-4000-8000-000000000001', name: 'primary', azure_account: 'storage',
  auth_mode: 'managed_identity', managed_identity_client_id: null, user_delegation_sas_enabled: false,
  has_secret_ref: false, region_label: null, enabled: true,
} satisfies components['schemas']['StorageBackendResponse']

describe('normalizeResourceRows', () => {
  it('normalizes credential and policy envelopes', () => {
    expect(normalizeResourceRows('/admin/credentials', {
      count: 1,
      items: [credential],
    })).toEqual([credential])

    expect(normalizeResourceRows('/admin/policies', {
      count: 1,
      items: [policy],
    })).toEqual([policy])
  })

  it('preserves array collection rows', () => {
    expect(normalizeResourceRows('/admin/backends', [
      backend,
    ])).toEqual([backend])
  })

  it('accepts empty collections but rejects malformed wire responses', () => {
    expect(normalizeResourceRows('/admin/credentials', { count: 0, items: [] })).toEqual([])
    const malformed = JSON.parse('{"count":0}') as components['schemas']['CredentialListResponse']
    expect(() => normalizeResourceRows('/admin/credentials', malformed)).toThrow('Invalid resource collection response')
    const invalidArray = JSON.parse('{}') as components['schemas']['StorageBackendList']
    expect(() => normalizeResourceRows('/admin/backends', invalidArray)).toThrow('Invalid resource collection response')
  })
})