import type { Schema } from '../../api/control'
import { virtualBucketAliasError } from '../resources/validation'

export type Mapping = Schema['AdminVirtualMapping']
export type Identity = Schema['IdentityProjection']
export type Backend = Schema['StorageBackendProjection']
export type RoutingContext = { identities: readonly Identity[]; backends: readonly Backend[]; capabilities: Schema['ControlCapabilities'] }
export type MappingDraft = { alias: string; container: string; owner: string; backend: string; prefix: string; enabled: boolean }
export type EffectiveTarget = { source: string; account: string; blocked?: string }

export function reviewedRoutingContext(context: RoutingContext, mapping: Mapping | null): RoutingContext {
  if (!mapping) return context
  return { ...context, identities: context.identities.map(identity => identity.credential_id === mapping.credential_id ? { ...identity, default_backend_id: mapping.credential_default_backend_id } : identity) }
}

export function effectiveTarget(identity: Identity | undefined, override: string | null, context: RoutingContext): EffectiveTarget {
  if (!identity) return { source: 'Unavailable', account: '', blocked: 'Owner identity is missing' }
  const selectedId = context.capabilities.backend_routing_enabled ? override ?? identity.default_backend_id : null
  const source = selectedId ? override ? 'Mapping override' : 'Identity default' : 'Legacy account'
  if (selectedId) {
    const backend = context.backends.find(item => item.id === selectedId)
    if (!backend) return { source, account: '', blocked: 'Selected backend is missing' }
    return { source, account: backend.azure_account, blocked: !identity.enabled ? 'Owner identity is disabled' : !backend.enabled ? 'Selected backend is disabled' : !context.capabilities.usable_registry_auth_modes.includes(backend.auth_mode) ? 'Selected backend authentication is unavailable' : undefined }
  }
  return { source, account: identity.azure_account, blocked: !identity.enabled ? 'Owner identity is disabled' : !context.capabilities.legacy_routing_available ? 'Legacy routing is unavailable' : undefined }
}

export function mappingDraft(mapping?: Mapping): MappingDraft {
  return { alias: mapping?.virtual_bucket_name ?? '', container: mapping?.azure_container ?? '', owner: mapping?.credential_id ?? '', backend: mapping?.backend_id ?? '', prefix: mapping?.endpoint_prefix ?? '', enabled: mapping?.enabled ?? true }
}

export function draftError(draft: MappingDraft, context: RoutingContext, existing?: Mapping): string | undefined {
  const aliasError = virtualBucketAliasError(draft.alias)
  if (aliasError) return aliasError
  if (draft.alias.includes('--')) return 'Consecutive hyphens are not allowed in an S3 bucket alias.'
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(draft.container) || draft.container.includes('--') || draft.container.includes('\n')) return 'Azure container must be 3-63 lowercase letters, digits or single hyphens.'
  if (draft.prefix && (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(draft.prefix) || draft.prefix.includes('\n'))) return 'Endpoint prefix must be a DNS label of 1-63 characters.'
  if (existing && (draft.alias !== existing.virtual_bucket_name || draft.owner !== existing.credential_id)) return 'Alias and owner cannot change.'
  const owner = context.identities.find(identity => identity.credential_id === draft.owner)
  if (owner?.access_mode !== 'virtual') return 'Select a virtual identity.'
  if (draft.backend && !context.capabilities.backend_routing_enabled && draft.backend !== existing?.backend_id) return 'Backend routing is disabled.'
  return effectiveTarget(owner, draft.backend || null, context).blocked
}

export function createMappingPayload(draft: MappingDraft, revision?: number): Schema['CreateVirtualMapping'] {
  return { virtual_bucket_name: draft.alias, azure_container: draft.container, credential_id: draft.owner, backend_id: draft.backend || null, endpoint_prefix: draft.prefix || null, ...(draft.backend ? { expected_backend_revision: revision } : {}) }
}

export function updateMappingPayload(draft: MappingDraft, existing: Mapping, revision?: number): Schema['UpdateVirtualMapping'] {
  return {
    expected_impact_token: existing.impact_token,
    ...(draft.container !== existing.azure_container ? { azure_container: draft.container } : {}),
    ...(draft.backend !== (existing.backend_id ?? '') ? { backend_id: draft.backend || null, ...(draft.backend ? { expected_backend_revision: revision } : {}) } : {}),
    ...(draft.prefix !== (existing.endpoint_prefix ?? '') ? { endpoint_prefix: draft.prefix || null } : {}),
    ...(draft.enabled !== existing.enabled ? { enabled: draft.enabled } : {}),
  }
}

export function listingTemplates(endpoint: string | null): { cli: string; javascript: string } | undefined {
  if (!endpoint || endpoint.trim() !== endpoint) return undefined
  try {
    const parsed = new URL(endpoint)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || /[\r\n]/.test(endpoint)) return undefined
  } catch { return undefined }
  const quoted = `'${endpoint.replaceAll("'", "'\\''")}'`
  return {
    cli: `# AWS profile configuration: s3.addressing_style = path\naws --profile PROFILE_NAME --endpoint-url ${quoted} s3api list-buckets\naws --profile PROFILE_NAME --endpoint-url ${quoted} s3api list-objects-v2 --bucket AZURE_CONTAINER_NAME`,
    javascript: `import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'\n\nconst client = new S3Client({\n  endpoint: ${JSON.stringify(endpoint)},\n  region: 'us-east-1',\n  forcePathStyle: true,\n})\nawait client.send(new ListBucketsCommand({}))\nawait client.send(new ListObjectsV2Command({ Bucket: 'AZURE_CONTAINER_NAME' }))`,
  }
}