import { expect, it } from 'vitest'
import type { Schema } from '../../api/control'
import { createDirectMappingPayload, directMappingRemovalDescription, directMappingRows, updateDirectMappingPayload } from './direct-mappings'

const direct: Schema['IdentityProjection'] = { credential_id: 'direct-id', s3_access_key: 'SYNTHETIC', azure_account: 'accountone', access_mode: 'direct', enabled: true, default_backend_id: null, use_managed_identity: true, versioning_enabled: false, virtual_bucket_count: 0, policy_attachment_count: 2 }

it('lists only direct metadata and retains disabled mappings for management', () => {
  const disabled = { ...direct, credential_id: 'disabled-id', enabled: false }
  expect(directMappingRows([direct, { ...direct, access_mode: 'virtual' }, disabled])).toEqual([direct, disabled])
  expect(directMappingRows([])).toEqual([])
})

it('creates only a direct identity/account mapping with no bucket or blob operation', () => {
  expect(createDirectMappingPayload({ azureAccount: 'accountone', defaultBackendId: 'backend-id', versioningEnabled: true })).toEqual({ s3_access_key: '', s3_secret_key: '', azure_account: 'accountone', use_managed_identity: true, access_mode: 'direct', versioning_enabled: true, default_backend_id: 'backend-id' })
  expect(createDirectMappingPayload({ azureAccount: 'accountone', defaultBackendId: '', versioningEnabled: false }).default_backend_id).toBeNull()
})

it('updates only direct configuration and never changes mode or credentials', () => {
  const input = { identity: direct, azureAccount: 'accounttwo', defaultBackendId: 'backend-id', enabled: false, versioningEnabled: true }
  expect(updateDirectMappingPayload(input)).toEqual({ azure_account: 'accounttwo', default_backend_id: 'backend-id', enabled: false, versioning_enabled: true })
  expect(updateDirectMappingPayload({ ...input, azureAccount: direct.azure_account, defaultBackendId: '' })).toEqual({ enabled: false, versioning_enabled: true })
  expect(() => updateDirectMappingPayload({ ...input, identity: { ...direct, access_mode: 'virtual' } })).toThrow('Only direct')
  expect(() => updateDirectMappingPayload({ ...input, identity: { ...direct, use_managed_identity: false } })).toThrow('replacement')
  for (const azureAccount of ['Account', 'ab', 'account\n', 'account-with-dashes', 'a'.repeat(25)]) expect(() => updateDirectMappingPayload({ ...input, azureAccount })).toThrow('Azure account')
})

it('describes identity revocation and retained physical data before mapping removal', () => {
  const description = directMappingRemovalDescription(direct)
  expect(description).toContain('Revokes this S3 identity')
  expect(description).toContain('2 policy attachments')
  expect(description).toContain('containers, blobs and native versions are retained')
  expect(description).not.toContain(direct.s3_access_key)
})