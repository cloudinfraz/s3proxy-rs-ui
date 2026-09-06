import { describe, expect, it } from 'vitest'
import type { Schema } from '../../api/control'
import { directListExamples, directTarget } from './direct-details'

const identity: Schema['IdentityProjection'] = { credential_id: 'owner', s3_access_key: 'synthetic-access', azure_account: 'legacyaccount', access_mode: 'direct', enabled: true, default_backend_id: 'default', use_managed_identity: true, versioning_enabled: false, virtual_bucket_count: 0, policy_attachment_count: 0 }
const backend: Schema['StorageBackendProjection'] = { id: 'default', name: 'primary', azure_account: 'selectedaccount', auth_mode: 'managed_identity', managed_identity_client_id: null, enabled: true, has_secret_ref: false, user_delegation_sas_enabled: true, region_label: null, credential_default_count: 1, virtual_bucket_count: 0, impact_token: 'a'.repeat(32) }
const capabilities: Schema['ControlCapabilities'] = { plane: 'control', authz_mode: 'off', sts_enabled: false, iam_assume_role_enabled: false, assume_role_ready: false, iam_account_configured: false, backend_routing_enabled: true, usable_registry_auth_modes: ['managed_identity'], legacy_routing_available: true, public_s3_endpoint: null, public_sts_endpoint: null }
const input = { identity, backends: [backend], capabilities }

describe('direct target metadata', () => {
  it('selects the identity default only with routing enabled', () => {
    expect(directTarget(input)).toEqual({ source: 'Identity default', account: 'selectedaccount', backend: 'primary', blocked: undefined })
    expect(directTarget({ ...input, capabilities: { ...capabilities, backend_routing_enabled: false }, backends: undefined })).toMatchObject({ source: 'Legacy account', account: 'legacyaccount', blocked: undefined })
    expect(directTarget({ ...input, identity: { ...identity, default_backend_id: null } })).toMatchObject({ source: 'Legacy account', account: 'legacyaccount' })
  })
  it('never falls back when selected metadata is missing or unusable', () => {
    expect(directTarget({ ...input, backends: [] })).toMatchObject({ account: null, blocked: 'Selected backend missing' })
    expect(directTarget({ ...input, backends: undefined }).blocked).toBe('Backend metadata unavailable')
    expect(directTarget({ ...input, backends: [{ ...backend, enabled: false }] })).toMatchObject({ account: 'selectedaccount', blocked: 'Selected backend disabled' })
    expect(directTarget({ ...input, backends: [{ ...backend, auth_mode: 'sas_token' }] }).blocked).toBe('Selected backend authentication unavailable')
    expect(directTarget({ ...input, capabilities: undefined })).toMatchObject({ account: null, blocked: 'Runtime capabilities unavailable' })
  })
  it('reports disabled identities and rejects virtual inputs', () => {
    expect(directTarget({ ...input, identity: { ...identity, enabled: false } }).blocked).toBe('Identity disabled')
    expect(directTarget({ ...input, identity: { ...identity, access_mode: 'virtual' } })).toMatchObject({ account: null, blocked: 'Not a direct mapping' })
    expect(directTarget({ ...input, capabilities: { ...capabilities, backend_routing_enabled: false, legacy_routing_available: false } }).blocked).toBe('Legacy routing unavailable')
  })
  it('requires no backend metadata for legacy routing but never guesses capabilities', () => {
    const legacy = { ...identity, default_backend_id: null }
    expect(directTarget({ identity: legacy, capabilities })).toMatchObject({ source: 'Legacy account', account: 'legacyaccount', blocked: undefined })
    expect(directTarget({ identity: legacy })).toMatchObject({ account: null, blocked: 'Runtime capabilities unavailable' })
    expect(directTarget({ ...input, identity: { ...identity, enabled: false }, backends: [] })).toMatchObject({ account: null, backend: 'default' })
  })
})

describe('direct list examples', () => {
  it.each([null, undefined, '', ' https://s3.example.test', 'https://s3.example.test\n', 'https://s3.example.test/\tpath', 'https://s3.example.test/\u0000path', 'https://s3.example.test/\u007fpath', 'https://s3.example.test/a b', 'file:///tmp', 'javascript:alert(1)', 'https://user:pass@s3.example.test', 'https://user@s3.example.test', 'https://s3.example.test?sig=synthetic', 'https://s3.example.test#fragment', 'not-a-url'])('withholds examples for unsafe or missing endpoint %s', endpoint => {
    expect(directListExamples(endpoint)).toBeUndefined()
  })
  it('uses only the configured endpoint and preserves shell/JavaScript quoting', () => {
    const endpoint = 'https://s3.example.test/quote\'$(command)'
    const examples = directListExamples(endpoint)!
    expect(examples.endpoint).toBe(endpoint)
    expect(examples.cli).toContain("'\\''")
    expect(examples.javascript).toContain(JSON.stringify(endpoint))
    expect(examples.profile).toContain('addressing_style = path')
    expect(examples.javascript).toContain('forcePathStyle: true')
    expect(examples.cli.split('\n')).toHaveLength(2)
    expect(examples.cli).toContain('s3api list-buckets')
    expect(examples.cli).toContain('s3api list-objects-v2')
    expect(JSON.stringify(examples)).not.toMatch(/no-sign|no-verify|rejectUnauthorized|secretAccessKey|CreateBucket|Delete|recursive|synthetic-access/)
  })
  it.each(['https://public.example.test', 'http://127.0.0.1:8080'])('preserves the configured endpoint %s without adding credentials or operations', endpoint => {
    const examples = directListExamples(endpoint)!
    expect(examples.endpoint).toBe(endpoint)
    expect(examples.cli).toBe(`aws --profile PROFILE_NAME --endpoint-url '${endpoint}' s3api list-buckets\naws --profile PROFILE_NAME --endpoint-url '${endpoint}' s3api list-objects-v2 --bucket AZURE_CONTAINER_NAME`)
    expect(examples.javascript).not.toContain('credentials:')
    expect(examples.javascript).not.toContain('requestHandler:')
  })
})