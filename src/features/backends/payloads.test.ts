import { describe, expect, it } from 'vitest'
import type { Schema } from '../../api/control'
import { backendPayload, requiresImpactConfirmation } from './payloads'

const backend = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'primary',
  azure_account: 'storageaccount',
  auth_mode: 'managed_identity',
  managed_identity_client_id: null,
  user_delegation_sas_enabled: true,
  has_secret_ref: false,
  region_label: null,
  enabled: true,
  credential_default_count: 2,
  virtual_bucket_count: 3,
} satisfies Schema['StorageBackendProjection']

describe('backend UI payloads', () => {
  it('preserves no-selector Managed Identity without a secret reference', () => {
    expect(backendPayload({
      name: ' primary ', azureAccount: ' storageaccount ', authMode: 'managed_identity',
      managedIdentityClientId: '', userDelegationSasEnabled: true, secretRef: 'not-sent',
      regionLabel: '', enabled: true,
    })).toEqual({
      name: 'primary', azure_account: 'storageaccount', auth_mode: 'managed_identity',
      managed_identity_client_id: null, user_delegation_sas_enabled: true,
      secret_ref: null, region_label: null, enabled: true,
    })
  })

  it('uses only a reference for a capability-approved non-MI mode', () => {
    const payload = backendPayload({
      name: 'future', azureAccount: 'storage', authMode: 'account_key',
      managedIdentityClientId: '00000000-0000-4000-8000-000000000099',
      userDelegationSasEnabled: true, secretRef: 'operator-reference',
      regionLabel: 'eastus2', enabled: true,
    })
    expect(payload.managed_identity_client_id).toBeNull()
    expect(payload.user_delegation_sas_enabled).toBe(false)
    expect(payload.secret_ref).toBe('operator-reference')
    expect(payload).not.toHaveProperty('azure_key')
    expect(payload).not.toHaveProperty('sas_token')
  })

  it('requires confirmation for routing identity changes and disablement', () => {
    const unchanged = backendPayload({
      name: backend.name, azureAccount: backend.azure_account, authMode: backend.auth_mode,
      managedIdentityClientId: '', userDelegationSasEnabled: false, secretRef: '',
      regionLabel: '', enabled: true,
    })
    expect(requiresImpactConfirmation(backend, unchanged)).toBe(false)
    expect(requiresImpactConfirmation(backend, { ...unchanged, enabled: false })).toBe(true)
    expect(requiresImpactConfirmation(backend, { ...unchanged, azure_account: 'other' })).toBe(true)
  })
})