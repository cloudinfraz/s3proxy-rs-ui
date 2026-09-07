import type { Schema } from '../../api/control'

export type IdentityCreateInput = {
  azureAccount: string
  accessMode: Schema['CredentialAccessMode']
  versioningEnabled: boolean
  defaultBackendId: string
}

export function identityBackendOptions(backends: readonly { id: string; name: string; enabled: boolean }[] | undefined, currentId: string) {
  const options = (backends ?? []).filter(backend => backend.enabled)
    .map(backend => ({ id: backend.id, label: backend.name, disabled: false }))
  if (currentId && !options.some(option => option.id === currentId)) {
    const current = backends?.find(backend => backend.id === currentId)
    options.unshift({ id: currentId, label: `${current?.name ?? currentId} (${current ? 'disabled' : 'unavailable'})`, disabled: true })
  }
  return options
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
  enabled: boolean | null
  versioningEnabled: boolean
  defaultBackendId: string
}): Schema['UpdateCredentialRequest'] {
  const payload: Schema['UpdateCredentialRequest'] = {
    versioning_enabled: input.versioningEnabled,
  }
  if (input.enabled !== null) payload.enabled = input.enabled
  if (input.defaultBackendId) payload.default_backend_id = input.defaultBackendId
  return payload
}

export function replacementIdentityDraft(identity: Schema['IdentityProjection']): IdentityCreateInput {
  return {
    azureAccount: identity.azure_account,
    accessMode: identity.access_mode,
    versioningEnabled: identity.versioning_enabled,
    defaultBackendId: identity.default_backend_id ?? '',
  }
}

export function replacementIdentityPayload(identity: Schema['IdentityProjection']): Schema['CreateCredentialRequest'] {
  return createIdentityPayload(replacementIdentityDraft(identity))
}