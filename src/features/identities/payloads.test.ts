import { describe, expect, it } from 'vitest'
import { createIdentityPayload, identityBackendOptions, replacementIdentityDraft, replacementIdentityPayload, updateIdentityPayload } from './payloads'
import type { Schema } from '../../api/control'

const identity = {
  credential_id: '00000000-0000-4000-8000-000000000001',
  s3_access_key: 'AKIASYNTHETICONLY0001',
  azure_account: 'storage-account',
  access_mode: 'virtual',
  use_managed_identity: true,
  versioning_enabled: true,
  default_backend_id: '00000000-0000-4000-8000-000000000002',
  enabled: true,
  virtual_bucket_count: 2,
  policy_attachment_count: 3,
} satisfies Schema['IdentityProjection']

describe('identity UI payloads', () => {
  it('offers enabled backends and preserves a disabled selection without mutating metadata', () => {
    const backends = [{ id: 'active', name: 'Active', enabled: true }, { id: 'old', name: 'Old', enabled: false }]
    expect(identityBackendOptions(backends, 'old')).toEqual([
      { id: 'old', label: 'Old (disabled)', disabled: true },
      { id: 'active', label: 'Active', disabled: false },
    ])
    expect(backends[1].enabled).toBe(false)
    expect(identityBackendOptions(backends, 'active')).toHaveLength(1)
    expect(identityBackendOptions(backends, '')).toHaveLength(1)
  })

  it('keeps missing or unavailable backend metadata explicit', () => {
    expect(identityBackendOptions(undefined, 'missing')).toEqual([{ id: 'missing', label: 'missing (unavailable)', disabled: true }])
    expect(identityBackendOptions([], 'missing')).toEqual([{ id: 'missing', label: 'missing (unavailable)', disabled: true }])
    expect(identityBackendOptions(undefined, '')).toEqual([])
  })

  it('creates managed-identity credentials with server-generated S3 material', () => {
    expect(createIdentityPayload({ azureAccount: 'storage', accessMode: 'direct', versioningEnabled: false, defaultBackendId: '' })).toEqual({
      s3_access_key: '', s3_secret_key: '', azure_account: 'storage', use_managed_identity: true,
      access_mode: 'direct', versioning_enabled: false, default_backend_id: null,
    })
  })

  it('ordinary UI updates never send secret, access key, mode or backend clearing', () => {
    const payload = updateIdentityPayload({ enabled: false, versioningEnabled: true, defaultBackendId: '' })
    expect(payload).toEqual({ enabled: false, versioning_enabled: true })
    expect(payload).not.toHaveProperty('s3_secret_key')
    expect(payload).not.toHaveProperty('access_mode')
    expect(payload).not.toHaveProperty('s3_access_key')
    expect(payload).not.toHaveProperty('default_backend_id')
  })

  it('replacement copies safe settings without dependencies or existing S3 material', () => {
    const payload = replacementIdentityPayload(identity)
    expect(payload.s3_access_key).toBe('')
    expect(payload.s3_secret_key).toBe('')
    expect(payload).not.toHaveProperty('credential_id')
    expect(payload).not.toHaveProperty('virtual_bucket_count')
    expect(payload).not.toHaveProperty('policy_attachment_count')
  })

  it('prefills only editable non-secret settings for replacement review', () => {
    expect(replacementIdentityDraft(identity)).toEqual({
      azureAccount: identity.azure_account,
      accessMode: 'virtual',
      versioningEnabled: true,
      defaultBackendId: identity.default_backend_id,
    })
  })

  it('creates a replacement with reviewed mode and route without mutating the original', () => {
    const draft = replacementIdentityDraft(identity)
    draft.accessMode = 'direct'
    draft.azureAccount = 'replacementaccount'
    draft.defaultBackendId = ''
    const payload = createIdentityPayload(draft)
    expect(payload).toEqual({
      s3_access_key: '', s3_secret_key: '', azure_account: 'replacementaccount',
      use_managed_identity: true, access_mode: 'direct', versioning_enabled: true,
      default_backend_id: null,
    })
    expect(identity.access_mode).toBe('virtual')
    expect(identity.azure_account).toBe('storage-account')
    expect(identity.default_backend_id).not.toBe('')
  })

  it('does not import legacy Azure material when prefilling a replacement', () => {
    const legacy = { ...identity, use_managed_identity: false, default_backend_id: null, azure_key: 'synthetic-only' }
    expect(replacementIdentityDraft(legacy).defaultBackendId).toBe('')
    const payload = createIdentityPayload(replacementIdentityDraft(legacy))
    expect(payload.use_managed_identity).toBe(true)
    expect(payload).not.toHaveProperty('azure_key')
  })

  it('preserves unknown enabled state on unrelated edits', () => {
    expect(updateIdentityPayload({ enabled: null, versioningEnabled: false, defaultBackendId: '' }))
      .toEqual({ versioning_enabled: false })
  })

  it('sets an explicitly selected backend without changing identity material', () => {
    expect(updateIdentityPayload({ enabled: false, versioningEnabled: false, defaultBackendId: identity.default_backend_id }))
      .toEqual({ enabled: false, versioning_enabled: false, default_backend_id: identity.default_backend_id })
  })
})