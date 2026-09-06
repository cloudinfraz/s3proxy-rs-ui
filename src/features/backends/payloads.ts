import type { Schema } from '../../api/control'

export type BackendFormInput = {
  name: string
  azureAccount: string
  authMode: Schema['BackendAuthMode']
  managedIdentityClientId: string
  userDelegationSasEnabled: boolean
  secretRef: string
  regionLabel: string
  enabled: boolean
}

export function backendPayload(input: BackendFormInput): Schema['StorageBackendRequest'] {
  const managedIdentity = input.authMode === 'managed_identity'
  return {
    name: input.name.trim(),
    azure_account: input.azureAccount.trim(),
    auth_mode: input.authMode,
    managed_identity_client_id: managedIdentity ? input.managedIdentityClientId.trim() || null : null,
    user_delegation_sas_enabled: managedIdentity && input.userDelegationSasEnabled,
    secret_ref: managedIdentity ? null : input.secretRef.trim() || null,
    region_label: input.regionLabel.trim() || null,
    enabled: input.enabled,
  }
}

export function requiresImpactConfirmation(
  current: Schema['StorageBackendProjection'],
  next: Schema['StorageBackendRequest'],
): boolean {
  return current.azure_account !== next.azure_account
    || current.auth_mode !== next.auth_mode
    || current.managed_identity_client_id !== next.managed_identity_client_id
    || (current.enabled && !next.enabled)
}