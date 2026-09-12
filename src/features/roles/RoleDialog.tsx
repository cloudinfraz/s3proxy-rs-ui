import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ApiError } from '../../api/client'
import type { Schema } from '../../api/control'
import { invokeOperation } from '../../api/operations'
import { controlKeys, invalidateControl } from '../../api/query-keys'
import { DestructiveDialog, ErrorBanner, Modal } from '../../components/control'
import { completionGuard } from '../operations/state'
import { IdentitySelectorPagination, useIdentitySelectorPage } from '../identities/identity-selector'
import { createRoleRequest, mutationRequest, retainedLabel, roleDraft, validateRoleDraft, type RoleDetail, type RoleDraft, type RoleLimits, type RoleOperation, type RolePolicy } from './role-state'
import TrustEditor from './TrustEditor'

const titles: Record<RoleOperation, string> = { create: 'Create IAM role', trust: 'Replace trust', settings: 'Change duration', enabled: 'Change role status', attach: 'Attach policy', detach: 'Detach policy', retire: 'Retire sessions', delete: 'Delete role' }
const impacts: Record<RoleOperation, string> = {
  create: 'Creates role metadata. No Azure resources are created.',
  trust: 'Replaces the complete trust document for future issuance. Existing sessions are not retired by this action.',
  settings: 'A duration change invalidates sessions issued under the previous lifecycle revision.',
  enabled: 'A status change invalidates sessions issued under the previous lifecycle revision. Retained rows are not removed.',
  attach: 'Changes permissions for existing and future role sessions.',
  detach: 'Removes this policy from permissions for existing and future role sessions.',
  retire: 'Permanently removes one bounded batch of retained session rows, including expired rows. The role must remain disabled.',
  delete: 'Removes the disabled role and its attachments. Retained sessions must be zero. Azure data is unchanged.',
}
type Review = { detail?: RoleDetail; policy?: RolePolicy }

export default function RoleDialog({ operation, initial, limits, close, changed }: {
  operation: RoleOperation; initial?: RoleDetail; limits: RoleLimits
  close: () => void; changed: (detail: RoleDetail | null) => void
}) {
  const client = useQueryClient()
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const cursor = cursors[cursors.length - 1]
  const policies = useQuery({ queryKey: [...controlKeys.list('policies'), 'role-options', cursor], enabled: operation === 'attach', queryFn: ({ signal }) => invokeOperation('listRolePolicyOptions', { parameters: { query: { limit: 100, after_id: cursor ?? undefined } }, signal }) })
  const [draft, setDraft] = useState(() => roleDraft(limits, initial))
  const identitySelector = useIdentitySelectorPage(null, operation === 'create' || operation === 'trust', draft.owner)
  const identities = identitySelector.query
  const [initialDraft] = useState(() => JSON.stringify(draft))
  const [review, setReview] = useState<Review | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [retired, setRetired] = useState<{ count: number; detail: RoleDetail } | null>(null)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])
  const update = <Field extends keyof RoleDraft>(field: Field, value: RoleDraft[Field]) => setDraft(current => ({ ...current, [field]: value }))
  const needsIdentities = operation === 'create' || operation === 'trust'
  const selectedOwnerReady = !draft.owner || identitySelector.items.some(owner => owner.credential_id === draft.owner)
  const dependenciesReady = (!needsIdentities || (identities.data && !identities.isError && !identitySelector.selectedQuery.isFetching && selectedOwnerReady)) && (operation !== 'attach' || (policies.data && !policies.isError))

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !dependenciesReady) return
    const validation = validateRoleDraft(operation, draft, limits)
    if (validation) { setError(new Error(validation)); return }
    const request = guard.current.begin(); setPending(true); setError(null)
    try {
      if (operation === 'create') {
        const owners = await identities.refetch()
        const owner = owners.data?.items.find(item => item.credential_id === draft.owner) ?? identitySelector.selectedQuery.data
        if (owners.isError || owner?.credential_id !== draft.owner || !owner.enabled) throw new Error('Selected resource owner is unavailable')
        createRoleRequest(draft, limits)
        if (guard.current.current(request)) setReview({})
      } else {
        if (!initial) throw new Error('Role review is unavailable')
        const detail = await invokeOperation('getAdminRole', { parameters: { path: { role_id: initial.role.id } } })
        let policy: RolePolicy | undefined
        if (operation === 'attach') {
          const options = await policies.refetch()
          if (options.isError) throw new Error('Policy selection is unavailable')
          policy = options.data?.items.find(item => item.id === draft.policy)
        } else if (operation === 'detach') policy = detail.policies.find(item => item.id === draft.policy)
        mutationRequest(operation, draft, detail, policy)
        if (guard.current.current(request)) setReview({ detail, policy })
      }
    } catch (cause) { if (guard.current.current(request)) setError(new Error(cause instanceof Error ? cause.message : 'Role review failed')) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  async function persist() {
    if (pending || !review) return
    const request = guard.current.begin(); setPending(true); setError(null)
    try {
      if (operation === 'create') {
        const detail = await invokeOperation('createAdminRole', { body: createRoleRequest(draft, limits) })
        void invalidateControl(client)
        if (guard.current.current(request)) { changed(detail); close() }
      } else {
        if (!review.detail) throw new Error('Role review is unavailable')
        const result = await invokeRoleMutation(operation, draft, review.detail, review.policy)
        void invalidateControl(client)
        if (!guard.current.current(request)) return
        changed(result.detail)
        if (operation === 'retire') {
          if (!result.detail || result.retired_sessions === null) throw new Error('Retirement outcome unavailable; refresh the role before retrying')
          setRetired({ count: result.retired_sessions, detail: result.detail }); setReview(null)
        } else close()
      }
    } catch (cause) {
      if (guard.current.current(request)) {
        setError(new Error(cause instanceof Error ? cause.message : 'Role change failed'))
        setReview(null)
        if (cause instanceof ApiError && cause.status === 409) {
          await invalidateControl(client)
          if (initial && guard.current.current(request)) {
            try {
              const latest = await invokeOperation('getAdminRole', { parameters: { path: { role_id: initial.role.id } } })
              if (guard.current.current(request)) changed(latest)
            } catch {
              if (guard.current.current(request)) setError(new Error('The role changed, but current details could not be refreshed.'))
            }
          }
        }
      }
    } finally { if (guard.current.current(request)) setPending(false) }
  }

  const policyOptions = operation === 'detach' ? initial?.policies : policies.data?.items.filter(policy => !initial?.policies.some(attached => attached.id === policy.id))
  const destructiveReview = Boolean(review) && (operation === 'retire' || operation === 'delete' || operation === 'detach' || (operation === 'enabled' && !draft.enabled))
  const confirmLabel = operation === 'retire' ? 'Retire this batch' : operation === 'delete' ? `Delete ${initial?.role.role_name ?? 'role'}` : operation === 'detach' ? `Detach ${review?.policy?.name ?? 'policy'}` : `Disable ${initial?.role.role_name ?? 'role'}`
  const content = <>
    {error && <ErrorBanner error={error} />}
    {needsIdentities && identities.isError && <ErrorBanner error={new Error('Identity metadata unavailable')} retry={() => { void identities.refetch() }} />}
    {needsIdentities && draft.owner && identitySelector.selectedQuery.isError && <ErrorBanner error={new Error('Selected resource owner metadata unavailable')} retry={() => { void identitySelector.selectedQuery.refetch() }} />}
    {operation === 'attach' && policies.isError && <ErrorBanner error={new Error('Policy metadata unavailable')} retry={() => { void policies.refetch() }} />}
    {retired ? <><p role="status">Retired {retired.count} session rows. Remaining: {retainedLabel(retired.detail.retained_sessions)}.</p><div className="dialog-actions"><button onClick={close}>Close</button>{retired.detail.retained_sessions.count > 0 && <button className="primary" onClick={() => { setRetired(null); setError(null) }}>Review next batch</button>}</div></>
      : review ? <><dl className="role-detail-grid"><dt>Role</dt><dd>{review.detail?.role.role_arn ?? `arn:aws:iam::${draft.account}:role${draft.path}${draft.name}`}</dd>
        {operation === 'create' && <><dt>Resource owner</dt><dd>{draft.owner}</dd></>}
        {(operation === 'create' || operation === 'settings') && <><dt>Duration</dt><dd>{review.detail ? `${review.detail.role.max_session_duration_seconds} to ` : ''}{draft.duration} seconds</dd></>}
        {(operation === 'create' || operation === 'trust') && <><dt>Trust statements</dt><dd>{draft.trust.map((statement, index) => <section key={index} aria-label={`Reviewed trust statement ${index + 1}`}><strong>{statement.effect}</strong><ul>{statement.principals.map(principal => <li key={principal}>{principal}</li>)}</ul>{statement.conditions.length > 0 && <ul>{statement.conditions.map(condition => <li key={`${condition.operator}:${condition.key}`}>{condition.operator}: {condition.key}</li>)}</ul>}</section>)}</dd><dt>Condition values</dt><dd>Write-only</dd></>}
        {operation === 'enabled' && <><dt>Status</dt><dd>{review.detail?.role.enabled ? 'Enabled' : 'Disabled'} to {draft.enabled ? 'Enabled' : 'Disabled'}</dd></>}
        {review.policy && <><dt>Policy</dt><dd>{review.policy.name}</dd><dt>Policy revision</dt><dd>{review.policy.revision}</dd></>}
        {(operation === 'retire' || operation === 'delete') && review.detail && <><dt>Retained sessions</dt><dd>{retainedLabel(review.detail.retained_sessions)}</dd><dt>Role status</dt><dd>{review.detail.role.enabled ? 'Enabled' : 'Disabled'}</dd></>}
        {operation === 'retire' && <><dt>Maximum this batch</dt><dd>{draft.batch}</dd></>}
      </dl>{!destructiveReview && <div className="dialog-actions"><button disabled={pending} onClick={() => setReview(null)}>Back</button><button className="primary" disabled={pending} onClick={() => { void persist() }}>{pending ? 'Applying...' : 'Confirm change'}</button></div>}</>
        : <form className="operation-form" onSubmit={event => { void prepare(event) }}>
          {operation === 'create' && <><label>Account ID<input required pattern="[0-9]{12}" maxLength={12} value={draft.account} onChange={event => { update('account', event.target.value); update('trust', draft.trust.map(statement => ({ ...statement, principals: [] }))) }} /></label><label>Role path<input required value={draft.path} maxLength={512} onChange={event => update('path', event.target.value)} /></label><label>Role name<input required maxLength={64} value={draft.name} onChange={event => update('name', event.target.value)} /></label><label>Resource owner<select required value={draft.owner} onChange={event => update('owner', event.target.value)}><option value="">Select identity</option>{identitySelector.items.map(identity => <option key={identity.credential_id} value={identity.credential_id} disabled={!identity.enabled}>{identity.s3_access_key}</option>)}</select></label></>}
          {(operation === 'create' || operation === 'settings') && <label>Maximum duration (seconds)<input type="number" required min={limits.min_duration_seconds} max={limits.max_duration_seconds} step={1} value={draft.duration} onChange={event => update('duration', event.target.value)} /></label>}
          {(operation === 'create' || operation === 'trust') && <><TrustEditor account={draft.account} statements={draft.trust} identities={identitySelector.items} change={value => update('trust', value)} /><IdentitySelectorPagination page={identitySelector.page} pending={identities.isFetching || identitySelector.selectedQuery.isFetching} canPrevious={identitySelector.canPrevious} canNext={identitySelector.canNext} previous={identitySelector.previous} next={identitySelector.next} /></>}
          {operation === 'trust' && <label className="checkbox-field"><input type="checkbox" required checked={draft.acknowledge} onChange={event => update('acknowledge', event.target.checked)} /> Replace all existing trust statements and conditions, including hidden values.</label>}
          {operation === 'enabled' && <label className="checkbox-field"><input type="checkbox" checked={draft.enabled} onChange={event => update('enabled', event.target.checked)} /> Enabled</label>}
          {(operation === 'attach' || operation === 'detach') && <><label>Policy<select required value={draft.policy} onChange={event => update('policy', event.target.value)}><option value="">Select policy</option>{policyOptions?.map(policy => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label>{operation === 'attach' && <div className="role-pagination"><button type="button" className="icon-button" aria-label="Previous policy page" title="Previous policy page" disabled={cursors.length === 1 || policies.isFetching} onClick={() => { update('policy', ''); setCursors(current => current.slice(0, -1)) }}><ChevronLeft size={16} /></button><span>Policy page {cursors.length}</span><button type="button" className="icon-button" aria-label="Next policy page" title="Next policy page" disabled={!policies.data?.next_after_id || policies.isFetching} onClick={() => { if (policies.data?.next_after_id) { update('policy', ''); setCursors(current => [...current, policies.data.next_after_id]) } }}><ChevronRight size={16} /></button></div>}</>}
          {operation === 'retire' && <label>Maximum rows this batch<input type="number" required min={1} max={limits.max_retirement_batch} step={1} value={draft.batch} onChange={event => update('batch', event.target.value)} /></label>}
          <div className="dialog-actions"><button type="button" disabled={pending} onClick={close}>Cancel</button><button className="primary" disabled={pending || !dependenciesReady}>{pending ? 'Refreshing review...' : 'Review change'}</button></div>
        </form>}
  </>
  if (destructiveReview) return <DestructiveDialog title={titles[operation]} description={impacts[operation]} confirmLabel={confirmLabel} pending={pending} onClose={() => setReview(null)} onConfirm={() => { void persist() }}>{content}</DestructiveDialog>
  return <Modal wide={operation === 'create' || operation === 'trust'} dirty={JSON.stringify(draft) !== initialDraft} title={review ? `Confirm: ${titles[operation]}` : titles[operation]} description={impacts[operation]} onClose={close} pending={pending}>{content}</Modal>
}

function invokeRoleMutation(operation: Exclude<RoleOperation, 'create'>, draft: RoleDraft, detail: RoleDetail, policy?: RolePolicy) {
  const parameters = { path: { role_id: detail.role.id } }
  switch (operation) {
    case 'trust': return invokeOperation('replaceReviewedRoleTrust', { parameters, body: mutationRequest('trust', draft, detail, policy).body as Schema['ReviewRoleTrustRequest'] })
    case 'settings': return invokeOperation('updateReviewedRoleSettings', { parameters, body: mutationRequest('settings', draft, detail, policy).body as Schema['ReviewRoleSettingsRequest'] })
    case 'enabled': return invokeOperation('setReviewedRoleEnabled', { parameters, body: mutationRequest('enabled', draft, detail, policy).body as Schema['ReviewRoleEnabledRequest'] })
    case 'retire': return invokeOperation('retireReviewedRoleSessions', { parameters, body: mutationRequest('retire', draft, detail, policy).body as Schema['ReviewRoleRetirementRequest'] })
    case 'delete': return invokeOperation('deleteReviewedRole', { parameters, body: mutationRequest('delete', draft, detail, policy).body as Schema['ReviewRoleDeleteRequest'] })
    case 'attach': return invokeOperation('attachReviewedRolePolicy', { parameters, body: mutationRequest('attach', draft, detail, policy).body as Schema['ReviewRolePolicyRequest'] })
    case 'detach': return invokeOperation('detachReviewedRolePolicy', { parameters, body: mutationRequest('detach', draft, detail, policy).body as Schema['ReviewRolePolicyRequest'] })
  }
}