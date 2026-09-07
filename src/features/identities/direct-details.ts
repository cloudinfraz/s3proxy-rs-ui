import type { Schema } from '../../api/control'

type Identity = Schema['IdentityProjection']
type Backend = Schema['StorageBackendProjection']
type Capabilities = Schema['ControlCapabilities']
export type DirectTarget = { source: string; account: string | null; backend: string | null; blocked?: string }

export function directTarget(input: { identity: Identity; backends?: readonly Backend[]; capabilities?: Capabilities }): DirectTarget {
  const { identity, backends, capabilities } = input
  if (identity.access_mode !== 'direct') return { source: 'Unavailable', account: null, backend: null, blocked: 'Not a direct mapping' }
  if (!capabilities) return { source: 'Unavailable', account: null, backend: null, blocked: 'Runtime capabilities unavailable' }
  if (!capabilities.backend_routing_enabled || !identity.default_backend_id) {
    return { source: 'Legacy account', account: identity.azure_account, backend: null, blocked: !identity.enabled ? 'Identity disabled' : !capabilities.legacy_routing_available ? 'Legacy routing unavailable' : undefined }
  }
  const selected = backends?.find(backend => backend.id === identity.default_backend_id)
  if (!selected) return { source: 'Identity default', account: null, backend: identity.default_backend_id, blocked: backends ? 'Selected backend missing' : 'Backend metadata unavailable' }
  return {
    source: 'Identity default', account: selected.azure_account, backend: selected.name,
    blocked: !identity.enabled ? 'Identity disabled' : !selected.enabled ? 'Selected backend disabled' : !capabilities.usable_registry_auth_modes.includes(selected.auth_mode) ? 'Selected backend authentication unavailable' : undefined,
  }
}

export function directListExamples(endpoint: string | null | undefined) {
  if (!endpoint || endpoint.trim() !== endpoint || Array.from(endpoint).some(character => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 0x20 || codePoint === 0x7f)
  })) return undefined
  try {
    const parsed = new URL(endpoint)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return undefined
  } catch { return undefined }
  const shellEndpoint = `'${endpoint.replaceAll("'", "'\\''")}'`
  return {
    endpoint,
    profile: '[profile PROFILE_NAME]\nregion = us-east-1\ns3 =\n    addressing_style = path',
    cli: `aws --profile PROFILE_NAME --endpoint-url ${shellEndpoint} s3api list-buckets\naws --profile PROFILE_NAME --endpoint-url ${shellEndpoint} s3api list-objects-v2 --bucket AZURE_CONTAINER_NAME`,
    javascript: `import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'\n\nconst client = new S3Client({\n  endpoint: ${JSON.stringify(endpoint)},\n  region: 'us-east-1',\n  forcePathStyle: true,\n})\nawait client.send(new ListBucketsCommand({}))\nawait client.send(new ListObjectsV2Command({ Bucket: 'AZURE_CONTAINER_NAME' }))`,
  }
}