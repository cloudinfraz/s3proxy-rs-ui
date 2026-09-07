import { describe, expect, it } from 'vitest'
import type { Schema } from '../../api/control'
import { bucketPolicyEndpoint, bucketPolicyRequest, createPolicyRequest, deletePolicyRequest, identityPolicyRequest, parsePolicyDocument, policyKeys, scopeLabel, simulationEffectLabel, simulationRequest, updatePolicyRequest, validationRequest, type BucketPolicyDetail, type IdentityPolicyDetail, type PolicyDetail } from './policy-state'

const policy: Schema['AdminPolicySummary'] = { id: '00000000-0000-4000-8000-000000000001', name: 'ReadReports', description: null, revision: 7, built_in: false, deletable: true, credential_attachment_count: 2, role_attachment_count: 1, updated_at: '' }
const detail: PolicyDetail = { policy, document: { Version: '2012-10-17', Statement: [] }, impact_token: 'review-token' }
const identity: IdentityPolicyDetail = { credential_id: '00000000-0000-4000-8000-000000000002', credential_revision: 4, attachments: [], impact_token: 'identity-token' }
const direct = { kind: 'direct' as const, bucket: 'reports' }
const virtual = { kind: 'virtual' as const, bucket_id: '00000000-0000-4000-8000-000000000003', bucket: 'team-reports', credential_id: identity.credential_id }
const bucketDetail = (scope: typeof direct | typeof virtual): BucketPolicyDetail => ({ policy: { scope, revision: 5, updated_at: '', review_token: 'bucket-token' }, document: { Version: '2012-10-17', Statement: [] } })

describe('policy JSON and reviewed requests', () => {
  it('rejects malformed and non-object JSON without normalizing source values', () => {
    expect(() => parsePolicyDocument('{')).toThrow('valid JSON')
    for (const value of ['null', '[]', '"policy"']) expect(() => parsePolicyDocument(value)).toThrow('JSON object')
    expect(parsePolicyDocument('{"Condition":{"StringEquals":{"key":" value:@/#? "}}}')).toEqual({ Condition: { StringEquals: { key: ' value:@/#? ' } } })
  })

  it('builds create, validation, update, and delete payloads from authoritative review state', () => {
    const source = '{"Version":"2012-10-17","Statement":[]}'
    expect(validationRequest(source, 'managed_policy')).toEqual({ kind: 'managed_policy', document: detail.document })
    expect(createPolicyRequest('ReadReports', '', source)).toEqual({ name: 'ReadReports', description: null, document: detail.document })
    expect(updatePolicyRequest(detail, 'Updated', source)).toEqual({ expected_impact_token: 'review-token', change: { description: 'Updated', document: detail.document } })
    expect(deletePolicyRequest(detail)).toEqual({ expected_impact_token: 'review-token' })
    expect(() => deletePolicyRequest({ ...detail, policy: { ...policy, name: 'FullAccess', built_in: true, deletable: false } })).toThrow('protected')
  })

  it('uses stable identity and policy IDs with both reviewed revisions', () => {
    expect(identityPolicyRequest(identity, policy)).toEqual({ expected_impact_token: 'identity-token', expected_credential_revision: 4, policy: { policy_id: policy.id, expected_policy_revision: 7 } })
    expect(identityPolicyRequest(identity, { policy_id: policy.id, policy_name: policy.name, policy_revision: 8, attached_at: '' }).policy.expected_policy_revision).toBe(8)
  })
})

describe('bucket scopes, simulation, and cache separation', () => {
  it('keeps direct and virtual scope labels, endpoints, and review keys distinct', () => {
    expect(scopeLabel(direct)).toBe('Direct global bucket: reports')
    expect(scopeLabel(virtual)).toContain(virtual.bucket_id)
    expect(bucketPolicyEndpoint(direct)).toBe('/admin/ui/bucket-policies/direct/reports')
    expect(bucketPolicyEndpoint(virtual)).toBe(`/admin/ui/bucket-policies/virtual/${virtual.bucket_id}`)
    expect(bucketPolicyRequest(bucketDetail(direct))).toEqual({ expected_review_token: 'bucket-token' })
    expect(bucketPolicyRequest(bucketDetail(virtual), '{"Statement":[]}')).toEqual({ expected_review_token: 'bucket-token', document: { Statement: [] } })
    expect(policyKeys.bucketDetail(direct)).not.toEqual(policyKeys.bucketDetail(virtual))
  })

  it('validates typed simulation inputs and presents all decision states', () => {
    const input = { credentialId: identity.credential_id, action: 's3:GetObject', resource: 'arn:aws:s3:::reports/2026.csv', conditions: { 'aws:SecureTransport': 'true' } }
    const request = simulationRequest(input)
    expect(request.conditions).toEqual({ 'aws:SecureTransport': 'true' })
    expect(() => simulationRequest({ ...input, credentialId: 'legacy-key' })).toThrow('stable credential ID')
    expect(() => simulationRequest({ ...input, action: 'GetObject' })).toThrow('S3 action')
    expect(() => simulationRequest({ ...input, resource: 'reports/2026.csv' })).toThrow('S3 ARN')
    const effects: Schema['AdminPolicySimulationEffect'][] = ['Allow', 'ExplicitDeny', 'ImplicitDeny']
    expect(effects.map(simulationEffectLabel)).toEqual(['Allowed', 'Explicit deny', 'Implicit deny'])
  })

  it('separates managed, identity, bucket, preflight, and simulation query assumptions', () => {
    const keys = [policyKeys.managedList(null), policyKeys.managedDetail(policy.id), policyKeys.identity(identity.credential_id, null), policyKeys.bucketList(null), policyKeys.preflight, policyKeys.simulation]
    expect(new Set(keys.map(key => JSON.stringify(key)))).toHaveLength(keys.length)
  })
})