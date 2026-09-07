import type { Schema } from '../../api/control'

export type Finding = { code: string; message: string; severity: 'warning' | 'unknown'; href?: string }
export type ReadinessInput = {
  capabilities?: Schema['ControlCapabilities']
  identities?: Schema['CredentialSummary'][]
  buckets?: Schema['VirtualBucketResponse'][]
  backends?: Schema['StorageBackendResponse'][]
  keys?: Schema['AdminApiKeySummary'][]
  roles?: Schema['AdminIamRole'][]
  now: number
}

export function deriveReadiness(input: ReadinessInput): Finding[] {
  const findings: Finding[] = []
  const add = (code: string, message: string, href?: string) => findings.push({ code, message, severity: 'warning', href })
  for (const field of ['capabilities', 'identities', 'buckets', 'backends', 'keys', 'roles'] as const) {
    if (!input[field]) findings.push({ code: `unavailable-${field}`, message: `${field} metadata unavailable`, severity: 'unknown' })
  }
  const capabilities = input.capabilities
  if (capabilities && (capabilities.sts_enabled || capabilities.iam_assume_role_enabled) && !capabilities.assume_role_ready) {
    add('assume-role-incomplete', 'AssumeRole configuration is incomplete')
  }
  const backends = new Map(input.backends?.map(backend => [backend.id, backend]))
  const identities = new Map(input.identities?.filter(identity => identity.credential_id).map(identity => [identity.credential_id, identity]))
  function checkBackend(id: string, code: string) {
    if (!input.backends) return
    const backend = backends.get(id)
    if (!backend) add(`${code}-missing-backend`, 'A routing reference points to a missing backend', '/azure-backends')
    else if (!backend.enabled) add(`${code}-disabled-backend`, `Referenced backend ${backend.name} is disabled`, '/azure-backends')
    else if (capabilities && !capabilities.usable_registry_auth_modes.includes(backend.auth_mode)) add(`${code}-unsupported-backend`, `Referenced backend ${backend.name} uses an unavailable authentication mode`, '/azure-backends')
  }
  for (const backend of input.backends ?? []) {
    if (backend.enabled && capabilities && !capabilities.usable_registry_auth_modes.includes(backend.auth_mode)) add(`backend-${backend.id}-unsupported`, `Backend ${backend.name} authentication is not usable`, '/azure-backends')
  }
  for (const identity of input.identities ?? []) {
    const code = `identity-${identity.credential_id ?? 'unidentified'}`
    if (capabilities?.backend_routing_enabled && identity.default_backend_id) checkBackend(identity.default_backend_id, code)
    if (identity.access_mode === 'virtual' && input.buckets && !input.buckets.some(bucket => bucket.credential_id === identity.credential_id && bucket.enabled)) add(`${code}-no-routes`, 'A virtual identity has no enabled bucket mappings', '/buckets')
    if (identity.access_mode === 'direct' && capabilities && !capabilities.legacy_routing_available && (!capabilities.backend_routing_enabled || !identity.default_backend_id)) add(`${code}-no-backend`, 'A direct identity has no usable routing default', '/credentials')
  }
  for (const bucket of input.buckets ?? []) {
    if (!bucket.enabled) continue
    const identity = identities.get(bucket.credential_id)
    if (input.identities && !identity) add(`bucket-${bucket.id}-missing-owner`, `Mapping ${bucket.virtual_bucket_name} has no known identity`, '/buckets')
    const selected = bucket.backend_id ?? identity?.default_backend_id
    if (capabilities?.backend_routing_enabled && selected) checkBackend(selected, `bucket-${bucket.id}`)
    if (capabilities && !capabilities.legacy_routing_available && (!capabilities.backend_routing_enabled || !selected)) add(`bucket-${bucket.id}-no-backend`, `Mapping ${bucket.virtual_bucket_name} has no usable backend`, '/buckets')
  }
  for (const role of input.roles ?? []) {
    if (role.enabled && input.identities && !identities.has(role.resource_credential_id)) add(`role-${role.id}-missing-owner`, `Role ${role.role_name} has no known resource identity`)
  }
  if (input.roles?.some(role => role.enabled)) findings.push({ code: 'role-policy-unknown', message: 'Effective role policy readiness is unavailable from the current control API', severity: 'unknown' })
  if (input.identities?.length) findings.push({ code: 'identity-state-unknown', message: 'Identity enabled state is unavailable from the current control API', severity: 'unknown' })
  for (const key of input.keys ?? []) {
    if (!key.enabled || !key.expires_at) continue
    const expiry = Date.parse(key.expires_at)
    if (!Number.isFinite(expiry) || !Number.isFinite(input.now)) findings.push({ code: `key-${key.id}-unknown-expiry`, message: `Expiration for admin key ${key.key_name} is unavailable`, severity: 'unknown', href: '/keys' })
    else if (expiry <= input.now + 7 * 86_400_000) add(`key-${key.id}-expiry`, `Admin key ${key.key_name} ${expiry <= input.now ? 'has expired' : 'expires within seven days'}`, '/keys')
  }
  return findings
}