import type { Schema } from '../../api/control'

export type RoleDetail = Schema['AdminIamRoleDetail']
export type RoleLimits = Schema['IamRoleLimits']
export type RolePolicy = Schema['AdminIamRolePolicy']
export type RoleOperation = 'create' | 'trust' | 'settings' | 'enabled' | 'attach' | 'detach' | 'retire' | 'delete'
export type TrustCondition = { operator: string; key: string; value: string }
export type TrustStatement = { effect: 'Allow' | 'Deny'; principals: string[]; conditions: TrustCondition[] }
export type RoleDraft = {
  account: string; path: string; name: string; owner: string; duration: string
  enabled: boolean; batch: string; policy: string; acknowledge: boolean
  trust: TrustStatement[]
}

export const conditionOperators: Record<string, readonly string[]> = {
  'sts:ExternalId': ['StringEquals', 'StringLike'],
  'sts:RoleSessionName': ['StringEquals', 'StringLike'],
  'sts:SourceIdentity': ['StringEquals', 'StringLike'],
  'aws:PrincipalArn': ['ArnEquals', 'ArnLike'],
  'aws:SourceIp': ['IpAddress', 'NotIpAddress'],
  'aws:SecureTransport': ['Bool'],
}

export function emptyStatement(): TrustStatement {
  return { effect: 'Allow', principals: [], conditions: [] }
}

export function roleDraft(limits: RoleLimits, detail?: RoleDetail): RoleDraft {
  return {
    account: detail?.role.account_id ?? '', path: detail?.role.role_path ?? '/',
    name: detail?.role.role_name ?? '', owner: detail?.role.resource_credential_id ?? '',
    duration: String(detail?.role.max_session_duration_seconds ?? limits.min_duration_seconds),
    enabled: !detail?.role.enabled, batch: String(limits.max_retirement_batch),
    policy: '', acknowledge: false, trust: [emptyStatement()],
  }
}

export function boundedInteger(value: string, min: number, max: number): number | undefined {
  if (!/^[0-9]+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined
}

export function trustError(account: string, statements: TrustStatement[]): string | undefined {
  if (!/^[0-9]{12}$/.test(account)) return 'Account must contain exactly 12 digits'
  if (!statements.length) return 'At least one trust statement is required'
  const principal = new RegExp(`^arn:aws:iam::${account}:user/s3proxy/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
  for (const statement of statements) {
    if (!statement.principals.length || statement.principals.some(value => !principal.test(value))) return 'Select same-account credential principals for every statement'
    const seen = new Set<string>()
    for (const condition of statement.conditions) {
      if (!conditionOperators[condition.key]?.includes(condition.operator)) return 'Unsupported trust condition'
      const identity = `${condition.operator}:${condition.key}`
      if (seen.has(identity)) return 'Duplicate condition key and operator in a statement'
      seen.add(identity)
      if (condition.value.length === 0) return 'Every trust condition requires a new value'
      if (condition.key === 'aws:SecureTransport' && !['true', 'false'].includes(condition.value)) return 'Secure transport must be true or false'
    }
  }
}

export function trustDocument(account: string, statements: TrustStatement[]) {
  const error = trustError(account, statements)
  if (error) throw new Error(error)
  return { Version: '2012-10-17', Statement: statements.map(statement => {
    const condition: Record<string, Record<string, string>> = {}
    for (const entry of statement.conditions) {
      condition[entry.operator] ??= {}
      condition[entry.operator][entry.key] = entry.value
    }
    return {
      Effect: statement.effect, Action: 'sts:AssumeRole', Principal: { AWS: [...statement.principals] },
      ...(statement.conditions.length ? { Condition: condition } : {}),
    }
  }) }
}

export function validateRoleDraft(operation: RoleOperation, draft: RoleDraft, limits: RoleLimits): string | undefined {
  if (operation === 'create') {
    if (!/^[A-Za-z0-9_+=,.@-]{1,64}$/.test(draft.name)) return 'Role name must contain 1-64 supported IAM characters'
    if (draft.path !== '/' && !/^\/[\x21-\x7e]{1,510}\/$/.test(draft.path)) return 'Role path must begin and end with / and contain at most 512 ASCII characters'
    if (!draft.owner) return 'Select a resource owner'
  }
  if (operation === 'create' || operation === 'trust') {
    const error = trustError(draft.account, draft.trust)
    if (error) return error
    if (operation === 'trust' && !draft.acknowledge) return 'Confirm replacement of all existing trust conditions'
  }
  if ((operation === 'create' || operation === 'settings') && boundedInteger(draft.duration, limits.min_duration_seconds, limits.max_duration_seconds) === undefined) return `Duration must be ${limits.min_duration_seconds}-${limits.max_duration_seconds} whole seconds`
  if (operation === 'retire' && boundedInteger(draft.batch, 1, limits.max_retirement_batch) === undefined) return `Batch size must be 1-${limits.max_retirement_batch}`
  if ((operation === 'attach' || operation === 'detach') && !draft.policy) return 'Select a policy'
}

export function mutationRequest(operation: Exclude<RoleOperation, 'create'>, draft: RoleDraft, detail: RoleDetail, policy?: RolePolicy) {
  const error = validateRoleDraft(operation, draft, detail.limits)
  if (error) throw new Error(error)
  const base = { expected_impact_token: detail.impact_token }
  const url = `/admin/ui/roles/${encodeURIComponent(detail.role.id)}`
  switch (operation) {
    case 'trust': return { url: `${url}/trust`, method: 'PUT', body: { ...base, change: { trust_policy: trustDocument(detail.role.account_id, draft.trust) }, acknowledge_condition_replacement: draft.acknowledge } satisfies Schema['ReviewRoleTrustRequest'] }
    case 'settings': return { url: `${url}/settings`, method: 'PUT', body: { ...base, change: { max_session_duration_seconds: Number(draft.duration) } } satisfies Schema['ReviewRoleSettingsRequest'] }
    case 'enabled': return { url: `${url}/enabled`, method: 'PUT', body: { ...base, change: { enabled: draft.enabled } } satisfies Schema['ReviewRoleEnabledRequest'] }
    case 'retire':
      if (detail.role.enabled) throw new Error('Disable the role before retiring sessions')
      return { url: `${url}/retire-sessions`, method: 'POST', body: { ...base, change: { batch_size: Number(draft.batch) } } satisfies Schema['ReviewRoleRetirementRequest'] }
    case 'delete':
      if (detail.role.enabled || !detail.retained_sessions.deletion_eligible || detail.retained_sessions.count !== 0 || detail.retained_sessions.truncated) throw new Error('Role must be disabled with no retained sessions before deletion')
      return { url, method: 'DELETE', body: base satisfies Schema['ReviewRoleDeleteRequest'] }
    case 'attach': case 'detach':
      if (!policy || policy.id !== draft.policy) throw new Error('Selected policy is unavailable; refresh and review again')
      return { url: `${url}/policies`, method: operation === 'attach' ? 'POST' : 'DELETE', body: { ...base, change: { policy_id: policy.id, expected_policy_revision: policy.revision } } satisfies Schema['ReviewRolePolicyRequest'] }
  }
}

export function createRoleRequest(draft: RoleDraft, limits: RoleLimits): Schema['CreateIamRoleRequest'] {
  const error = validateRoleDraft('create', draft, limits)
  if (error) throw new Error(error)
  return { account_id: draft.account, role_path: draft.path, role_name: draft.name,
    resource_credential_id: draft.owner, max_session_duration_seconds: Number(draft.duration),
    trust_policy: trustDocument(draft.account, draft.trust) }
}

export function retainedLabel(status: Schema['RetainedRoleSessions']): string {
  return `${status.count}${status.truncated ? '+' : ''}`
}