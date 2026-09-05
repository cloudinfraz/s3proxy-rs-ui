import type { Schema } from '../../api/control'

export type IdentityCreateInput = {
  azureAccount: string
  accessMode: Schema['CredentialAccessMode']
  versioningEnabled: boolean
  defaultBackendId: string
}

export function createIdentityPayload(input: IdentityCreateInput): Schema['CreateCredentialRequest'] {
  return {
    s3_access_key: '',
    s3_secret_key: '',
    azure_account: input.azureAccount,
    use_managed_identity: true,
    access_mode: input.accessMode,
    versioning_enabled: input.versioningEnabled,
    default_backend_id: input.defaultBackendId || null,
  }
}

export function updateIdentityPayload(input: {
  enabled: boolean
  versioningEnabled: boolean
  defaultBackendId: string
}): Schema['UpdateCredentialRequest'] {
  const payload: Schema['UpdateCredentialRequest'] = {
    enabled: input.enabled,
    versioning_enabled: input.versioningEnabled,
  }
  if (input.defaultBackendId) payload.default_backend_id = input.defaultBackendId
  return payload
}

export function replacementIdentityPayload(identity: Schema['IdentityProjection']): Schema['CreateCredentialRequest'] {
  return createIdentityPayload({
    azureAccount: identity.azure_account,
    accessMode: identity.access_mode,
    versioningEnabled: identity.versioning_enabled,
    defaultBackendId: identity.default_backend_id ?? '',
  })
}