import { describe, expect, it } from 'vitest'
import type { Schema } from '../../api/control'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { backendPayload, requiresImpactConfirmation, reviewedBackendPayload } from './payloads'
import { BackendDetails } from './BackendDetails'

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
  impact_token: '0123456789abcdef0123456789abcdef',
} satisfies Schema['StorageBackendProjection']

describe('backend UI payloads', () => {
  it('submits the reviewed token without leaking projection-only fields', () => {
    const payload = { name: backend.name, azure_account: backend.azure_account, auth_mode: backend.auth_mode, enabled: true, user_delegation_sas_enabled: false }
    expect(reviewedBackendPayload(payload, backend)).toEqual({ ...payload, expected_impact_token: backend.impact_token })
    expect(payload).not.toHaveProperty('expected_impact_token')
  })

  it('renders only safe details for unsupported modes without editable controls', () => {
    for (const mode of ['account_key', 'sas_token'] as const) {
      const details = renderToStaticMarkup(createElement(BackendDetails, { backend: {
        ...backend, auth_mode: mode, has_secret_ref: true, region_label: 'eastus2',
        secret_ref: 'must-not-render',
      } as Schema['StorageBackendProjection'] }))
      expect(details).toContain('<dt>Secret reference present</dt><dd>Yes</dd>')
      expect(details).toContain('<dt>Region label</dt><dd>eastus2</dd>')
      expect(details).toContain('<dt>User Delegation SAS</dt><dd>Enabled</dd>')
      expect(details).toContain('<dt>Identity</dt><dd>Not applicable</dd>')
      expect(details).not.toContain('must-not-render')
      expect(details).not.toContain(backend.impact_token)
      expect(details).not.toContain('<input')
    }
  })

  it('renders no-selector, selected identity, absent references and empty region safely', () => {
    const details = renderToStaticMarkup(createElement(BackendDetails, { backend }))
    expect(details).toContain('<dt>Secret reference present</dt><dd>No</dd>')
    expect(details).toContain('<dt>Region label</dt><dd>Not set</dd>')
    expect(details).toContain('System / workload identity')
    const selected = renderToStaticMarkup(createElement(BackendDetails, { backend: {
      ...backend, managed_identity_client_id: backend.id, enabled: false,
      user_delegation_sas_enabled: false, region_label: '<script>test</script>',
    } }))
    expect(selected).toContain(backend.id)
    expect(selected).toContain('<dt>User Delegation SAS</dt><dd>Disabled</dd>')
    expect(selected).toContain('<dt>Status</dt><dd>Disabled</dd>')
    expect(selected).not.toContain('<script>')
  })

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