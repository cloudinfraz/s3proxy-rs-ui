import { describe, expect, it } from 'vitest'
import { deriveReadiness, type ReadinessInput } from './readiness'

const now = Date.parse('2026-09-05T00:00:00Z')
const base: ReadinessInput = {
  now, identities: [], buckets: [], backends: [], keys: [], roles: [],
  capabilities: { plane: 'control', authz_mode: 'off', sts_enabled: false, iam_assume_role_enabled: false, assume_role_ready: false, iam_account_configured: false, backend_routing_enabled: true, usable_registry_auth_modes: ['managed_identity'], legacy_routing_available: true, public_sts_endpoint: null, public_s3_endpoint: null },
}
const identity = { credential_id: 'identity-id', s3_access_key: 'synthetic-do-not-emit', azure_account: 'account', access_mode: 'direct' as const, use_managed_identity: true, versioning_enabled: false, default_backend_id: 'backend-id', enabled: true, virtual_bucket_count: 0, policy_attachment_count: 0 }
const backend = { id: 'backend-id', name: 'primary', azure_account: 'account', auth_mode: 'managed_identity' as const, managed_identity_client_id: null, user_delegation_sas_enabled: false, has_secret_ref: false, region_label: null, enabled: false }

describe('configuration readiness', () => {
  it('accepts an empty valid inventory and distinguishes missing reads', () => {
    expect(deriveReadiness(base)).toEqual([])
    expect(deriveReadiness({ now }).filter(finding => finding.severity === 'unknown')).toHaveLength(6)
  })
  it('flags missing/disabled/unsupported referenced backends without exposing access keys', () => {
    const findings = deriveReadiness({ ...base, identities: [identity], backends: [backend] })
    expect(findings.some(finding => finding.code.endsWith('disabled-backend'))).toBe(true)
    expect(JSON.stringify(findings)).not.toContain(identity.s3_access_key)
    expect(deriveReadiness({ ...base, identities: [identity] }).some(finding => finding.code.endsWith('missing-backend'))).toBe(true)
    expect(deriveReadiness({ ...base, backends: [{ ...backend, enabled: true, auth_mode: 'sas_token' }] }).some(finding => finding.code.endsWith('unsupported'))).toBe(true)
  })
  it('respects disabled registry routing and flags incomplete virtual routes', () => {
    expect(deriveReadiness({ ...base, capabilities: { ...base.capabilities!, backend_routing_enabled: false }, identities: [identity] }).some(finding => finding.code.endsWith('missing-backend'))).toBe(false)
    expect(deriveReadiness({ ...base, identities: [{ ...identity, access_mode: 'virtual' }] }).some(finding => finding.code.endsWith('no-routes'))).toBe(true)
  })
  it('reports partial AssumeRole but does not flag intentionally disabled gates', () => {
    expect(deriveReadiness({ ...base, capabilities: { ...base.capabilities!, sts_enabled: true } }).some(finding => finding.code === 'assume-role-incomplete')).toBe(true)
    expect(deriveReadiness(base).some(finding => finding.code === 'assume-role-incomplete')).toBe(false)
  })
  it('handles exact expiry boundaries, disabled keys and invalid dates', () => {
    const key = { id: 'key-id', key_name: 'operator', description: null, enabled: true, created_at: '', last_used_at: null, expires_at: new Date(now + 7 * 86_400_000).toISOString(), created_by: null, status: 'active' }
    expect(deriveReadiness({ ...base, keys: [key] })).toHaveLength(1)
    expect(deriveReadiness({ ...base, keys: [{ ...key, expires_at: new Date(now + 7 * 86_400_000 + 1).toISOString() }] })).toHaveLength(0)
    expect(deriveReadiness({ ...base, keys: [{ ...key, enabled: false }] })).toHaveLength(0)
    expect(deriveReadiness({ ...base, keys: [{ ...key, expires_at: 'invalid' }] })[0].severity).toBe('unknown')
    expect(deriveReadiness({ ...base, keys: [{ ...key, expires_at: new Date(now).toISOString() }] })[0].message).toContain('has expired')
  })

  it('honors mapping overrides and ignores disabled mappings', () => {
    const bucket = { id: 'bucket-id', virtual_bucket_name: 'reports', azure_container: 'reports', credential_id: identity.credential_id, backend_id: backend.id, endpoint_prefix: null, enabled: true }
    const input = { ...base, identities: [{ ...identity, default_backend_id: null }], backends: [backend], buckets: [bucket] }
    expect(deriveReadiness(input).some(finding => finding.code === 'bucket-bucket-id-disabled-backend')).toBe(true)
    expect(deriveReadiness({ ...input, buckets: [{ ...bucket, enabled: false }] }).some(finding => finding.code.startsWith('bucket-'))).toBe(false)
    expect(deriveReadiness({ ...input, identities: [] }).some(finding => finding.code.endsWith('missing-owner'))).toBe(true)
    expect(deriveReadiness({ ...input, buckets: [{ ...bucket, backend_id: null }], capabilities: { ...base.capabilities!, legacy_routing_available: false } }).some(finding => finding.code.endsWith('no-backend'))).toBe(true)
  })

  it('does not invent role policy readiness or unsupported detail links', () => {
    const role = { id: 'role-id', role_id: 'AROAABCDEFGHIJKLMNOP', account_id: '123456789012', role_path: '/', role_name: 'reader', role_arn: 'arn:aws:iam::123456789012:role/reader', resource_credential_id: 'missing', trust_policy: {}, max_session_duration_seconds: 3600, enabled: true, lifecycle_revision: 1, trust_revision: 1, attachment_revision: 1, created_at: '', updated_at: '' }
    const findings = deriveReadiness({ ...base, roles: [role] })
    expect(findings.some(finding => finding.code === 'role-policy-unknown')).toBe(true)
    expect(findings.some(finding => finding.code.endsWith('missing-owner'))).toBe(true)
    expect(findings.every(finding => !finding.href)).toBe(true)
    expect(deriveReadiness({ ...base, roles: [{ ...role, enabled: false }] })).toEqual([])
  })
})