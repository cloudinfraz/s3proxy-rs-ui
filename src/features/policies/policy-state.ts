import type { Schema } from '../../api/control'

export type PolicyDetail = Schema['AdminPolicyDetail']
export type PolicySummary = Schema['AdminPolicySummary']
export type PolicyScope = Schema['AdminBucketPolicyScope']
export type BucketPolicyDetail = Schema['AdminBucketPolicyDetail']
export type IdentityPolicyDetail = Schema['AdminIdentityPolicyDetail']
export type IdentityPolicyReview = Pick<IdentityPolicyDetail, 'credential_id' | 'credential_revision' | 'impact_token'>
export type IdentityPolicyAttachment = Schema['AdminIdentityPolicyAttachment']

export const emptyPolicyDocument = JSON.stringify({ Version: '2012-10-17', Statement: [] }, null, 2)

export const policyKeys = {
  all: ['control', 'policy-workspace'] as const,
  managedList: (afterId: string | null) => ['control', 'policy-workspace', 'managed', 'list', { afterId }] as const,
  managedDetail: (policyId: string) => ['control', 'policy-workspace', 'managed', 'detail', policyId] as const,
  identity: (credentialId: string, afterId: string | null) => ['control', 'policy-workspace', 'identity', credentialId, { afterId }] as const,
  bucketList: (kind: PolicyScope['kind'], afterKey: string | null) => ['control', 'policy-workspace', 'bucket', 'list', { kind, afterKey }] as const,
  bucketDetail: (scope: PolicyScope) => ['control', 'policy-workspace', 'bucket', scope.kind, scope.kind === 'direct' ? scope.bucket : scope.bucket_id] as const,
  preflight: ['control', 'policy-workspace', 'preflight'] as const,
  simulation: ['control', 'policy-workspace', 'simulation'] as const,
}

export function parsePolicyDocument(source: string): Schema['JsonValue'] {
  let document: unknown
  try {
    document = JSON.parse(source)
  } catch {
    throw new Error('Policy document must be valid JSON')
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Policy document must be a JSON object')
  }
  return document
}

export function formatPolicyDocument(document: Schema['JsonValue']): string {
  return JSON.stringify(document, null, 2)
}

export function validationRequest(source: string, kind: Schema['AdminPolicyDocumentKind']): Schema['AdminValidatePolicyDraftRequest'] {
  return { kind, document: parsePolicyDocument(source) }
}

export function createPolicyRequest(name: string, description: string, source: string): Schema['AdminPolicyCreateRequest'] {
  if (!name.trim()) throw new Error('Policy name is required')
  return { name, description: description || null, document: parsePolicyDocument(source) }
}

export function updatePolicyRequest(detail: PolicyDetail, description: string, source: string): Schema['ReviewPolicyUpdateRequest'] {
  return { expected_impact_token: detail.impact_token, change: { description: description || null, document: parsePolicyDocument(source) } }
}

export function deletePolicyRequest(detail: PolicyDetail): Schema['ReviewPolicyDeleteRequest'] {
  if (!detail.policy.deletable || detail.policy.built_in || detail.policy.name === 'FullAccess') {
    throw new Error('FullAccess and other protected built-in policies cannot be deleted')
  }
  return { expected_impact_token: detail.impact_token }
}

export function identityPolicyRequest(detail: IdentityPolicyReview, policy: PolicySummary | IdentityPolicyAttachment): Schema['ReviewCredentialPolicyRequest'] {
  const policyId = 'id' in policy ? policy.id : policy.policy_id
  const revision = 'revision' in policy ? policy.revision : policy.policy_revision
  return {
    expected_impact_token: detail.impact_token,
    expected_credential_revision: detail.credential_revision,
    policy: { policy_id: policyId, expected_policy_revision: revision },
  }
}

export function scopeLabel(scope: PolicyScope): string {
  return scope.kind === 'direct'
    ? `Direct global bucket: ${scope.bucket}`
    : `Virtual bucket: ${scope.bucket} (${scope.bucket_id})`
}

export function bucketPolicyEndpoint(scope: PolicyScope): string {
  return scope.kind === 'direct'
    ? `/admin/ui/bucket-policies/direct/${encodeURIComponent(scope.bucket)}`
    : `/admin/ui/bucket-policies/virtual/${encodeURIComponent(scope.bucket_id)}`
}

export function bucketPolicyRequest(detail: BucketPolicyDetail, source?: string): Schema['ReviewBucketPolicyMutationRequest'] {
  return source === undefined
    ? { expected_review_token: detail.policy.review_token }
    : { expected_review_token: detail.policy.review_token, document: parsePolicyDocument(source) }
}

export function simulationRequest(input: {
  credentialId: string
  action: string
  resource: string
  conditions: Record<string, string>
}): Schema['AdminPolicySimulationRequest'] {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.credentialId)) throw new Error('Select an identity with a stable credential ID')
  if (!/^s3:[A-Za-z0-9*]+$/.test(input.action)) throw new Error('Action must be an S3 action such as s3:GetObject')
  if (!input.resource.startsWith('arn:aws:s3:::')) throw new Error('Resource must be an S3 ARN')
  if (Object.entries(input.conditions).some(([key, value]) => !key.trim() || !value.length)) throw new Error('Condition keys and values are required')
  return { credential_id: input.credentialId, action: input.action, resource: input.resource, conditions: { ...input.conditions } }
}

export function simulationEffectLabel(effect: Schema['AdminPolicySimulationEffect']): string {
  switch (effect) {
    case 'Allow': return 'Allowed'
    case 'ExplicitDeny': return 'Explicit deny'
    case 'ImplicitDeny': return 'Implicit deny'
  }
}