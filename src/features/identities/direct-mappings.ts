import type { Schema } from '../../api/control'
import { createIdentityPayload, updateIdentityPayload, type IdentityCreateInput } from './payloads'

export function directMappingRows(identities: readonly Schema['IdentityProjection'][]): Schema['IdentityProjection'][] {
  return identities.filter(identity => identity.access_mode === 'direct')
}

export function createDirectMappingPayload(input: Omit<IdentityCreateInput, 'accessMode'>): Schema['CreateCredentialRequest'] {
  return createIdentityPayload({ ...input, accessMode: 'direct' })
}

export function updateDirectMappingPayload(input: { identity: Schema['IdentityProjection']; azureAccount: string; defaultBackendId: string; enabled: boolean; versioningEnabled: boolean }): Schema['UpdateCredentialRequest'] {
  if (input.identity.access_mode !== 'direct') throw new Error('Only direct mappings can be configured here.')
  const payload = updateIdentityPayload(input)
  if (input.azureAccount !== input.identity.azure_account) {
    if (!input.identity.use_managed_identity) throw new Error('Account-key mappings require the identity replacement workflow to change Azure account.')
    if (!/^[a-z0-9]{3,24}$/.test(input.azureAccount) || input.azureAccount.includes('\n')) throw new Error('Azure account must be 3-24 lowercase letters or digits.')
    payload.azure_account = input.azureAccount
  }
  return payload
}

export function directMappingRemovalDescription(identity: Schema['IdentityProjection']): string {
  return `Revokes this S3 identity and removes its ${identity.virtual_bucket_count} mappings and ${identity.policy_attachment_count} policy attachments. Azure accounts, containers, blobs and native versions are retained.`
}