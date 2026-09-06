import { describe, expect, it } from 'vitest'
import { boundedInteger, createRoleRequest, mutationRequest, retainedLabel, roleDraft, trustDocument, trustError, validateRoleDraft, type RoleDetail, type RoleDraft, type RoleLimits } from './role-state'

const limits: RoleLimits = { min_duration_seconds: 3600, max_duration_seconds: 43200, max_retirement_batch: 1000, retained_count_cap: 1000, default_page_size: 100, max_page_size: 200 }
const owner = '00000000-0000-4000-8000-000000000001'
const detail: RoleDetail = { role: { id: owner, role_id: 'AROA0000000000000001', account_id: '123456789012', role_path: '/', role_name: 'Reports', role_arn: 'arn:aws:iam::123456789012:role/Reports', resource_credential_id: owner, enabled: false, max_session_duration_seconds: 3600, lifecycle_revision: 2, trust_revision: 3, attachment_revision: 4, created_at: '', updated_at: '' }, trust: { statements: [{ effect: 'Allow', principals: [], conditions: [{ operator: 'StringEquals', key: 'sts:ExternalId' }] }] }, policies: [], impact_token: 'a'.repeat(64), limits, retained_sessions: { count: 0, truncated: false, deletion_eligible: true } }
const draft: RoleDraft = { ...roleDraft(limits, detail), acknowledge: true, trust: [{ effect: 'Allow', principals: [`arn:aws:iam::123456789012:user/s3proxy/${owner}`], conditions: [{ operator: 'StringEquals', key: 'sts:ExternalId', value: ' synthetic:@/#? ' }] }] }

describe('role limits and trust inputs', () => {
  it('rejects invalid numbers without silently normalizing', () => {
    for (const value of ['3599', '43201', '3600.0', '3.6e3', ' 3600', '-1', 'Infinity', '']) expect(boundedInteger(value, 3600, 43200)).toBeUndefined()
    expect(boundedInteger('3600', 3600, 43200)).toBe(3600)
    expect(boundedInteger('43200', 3600, 43200)).toBe(43200)
    expect(validateRoleDraft('retire', { ...draft, batch: '1001' }, limits)).toContain('Batch')
    expect(validateRoleDraft('retire', { ...draft, batch: '1' }, limits)).toBeUndefined()
  })
  it('never hydrates replacement condition values or principals from stored summaries', () => {
    const blank = roleDraft(limits, detail)
    expect(blank.trust).toEqual([{ effect: 'Allow', principals: [], conditions: [] }])
    expect(blank.acknowledge).toBe(false)
    expect(validateRoleDraft('trust', { ...draft, acknowledge: false }, limits)).toContain('Confirm')
  })
  it('preserves condition values byte-for-byte and produces structured trust only', () => {
    const document = trustDocument(draft.account, draft.trust)
    expect(document.Statement[0].Condition?.StringEquals['sts:ExternalId']).toBe(' synthetic:@/#? ')
    expect(createRoleRequest(draft, limits)).toMatchObject({ role_name: 'Reports', resource_credential_id: owner, trust_policy: document })
    expect(trustError('987654321012', draft.trust)).toContain('same-account')
    expect(trustError(draft.account, [])).toContain('statement')
    const repeated = [{ ...draft.trust[0], conditions: [draft.trust[0].conditions[0], draft.trust[0].conditions[0]] }]
    expect(trustError(draft.account, repeated)).toContain('Duplicate')
    expect(trustError(draft.account, [{ ...draft.trust[0], conditions: [{ operator: 'Bool', key: 'aws:SecureTransport', value: 'yes' }] }])).toContain('true or false')
  })
})

describe('reviewed role actions', () => {
  it('sends distinct minimal requests and fresh review tokens', () => {
    const settings = mutationRequest('settings', draft, detail)
    expect(settings.body).toEqual({ expected_impact_token: detail.impact_token, change: { max_session_duration_seconds: 3600 } })
    expect(settings.url).toContain('/settings')
    expect(mutationRequest('enabled', draft, detail).body).toEqual({ expected_impact_token: detail.impact_token, change: { enabled: true } })
    expect(mutationRequest('delete', draft, detail)).toMatchObject({ method: 'DELETE', body: { expected_impact_token: detail.impact_token } })
    expect(mutationRequest('trust', draft, detail).body).toMatchObject({ acknowledge_condition_replacement: true })
  })
  it('requires disabled state and exact zero before deletion', () => {
    for (const changed of [
      { ...detail, role: { ...detail.role, enabled: true } },
      { ...detail, retained_sessions: { count: 1, truncated: false, deletion_eligible: false } },
      { ...detail, retained_sessions: { count: 0, truncated: true, deletion_eligible: true } },
    ]) expect(() => mutationRequest('delete', draft, changed)).toThrow('disabled')
    expect(() => mutationRequest('retire', draft, { ...detail, role: { ...detail.role, enabled: true } })).toThrow('Disable')
    expect(mutationRequest('retire', draft, detail).body).toMatchObject({ change: { batch_size: 1000 } })
    expect(retainedLabel({ count: 1000, truncated: true, deletion_eligible: false })).toBe('1000+')
  })
  it('requires the reviewed selected policy revision', () => {
    const selected = { id: owner, name: 'Read', revision: 8 }
    for (const action of ['attach', 'detach'] as const) {
      const changed = { ...draft, policy: owner }
      expect(() => mutationRequest(action, changed, detail)).toThrow('unavailable')
      expect(mutationRequest(action, changed, detail, selected).body).toEqual({ expected_impact_token: detail.impact_token, change: { policy_id: owner, expected_policy_revision: 8 } })
    }
  })
})