import { describe, expect, it } from 'vitest'
import { createIdentityPayload, replacementIdentityPayload, updateIdentityPayload } from './payloads'
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
})