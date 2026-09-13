import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Link as LinkIcon, Unlink } from 'lucide-react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import { invokeOperation } from '../../api/operations'
import { invalidateControl } from '../../api/query-keys'
import { DataTable, DestructiveDialog, ErrorBanner, Modal, RefreshButton } from '../../components/control'
import { IdentitySelectorPagination, useIdentitySelectorPage } from '../identities/identity-selector'
import { completionGuard } from '../operations/state'
import { identityPolicyRequest, policyKeys, type IdentityPolicyAttachment, type IdentityPolicyReview, type PolicySummary } from './policy-state'

type Review = { operation: 'attach' | 'detach'; detail: IdentityPolicyReview; policy: PolicySummary | IdentityPolicyAttachment }

export default function IdentityPolicies() {
  const client = useQueryClient()
  const [credentialId, setCredentialId] = useState('')
  const identitySelector = useIdentitySelectorPage(null, true, credentialId)
  const identities = identitySelector.query
  const [policyCursors, setPolicyCursors] = useState<Array<string | null>>([null])
  const policyCursor = policyCursors[policyCursors.length - 1]
  const policies = useQuery({ queryKey: policyKeys.managedList(policyCursor), queryFn: ({ signal }) => invokeOperation('listAdminPolicies', { parameters: { query: { limit: 100, after_id: policyCursor ?? undefined } }, signal }) })
  const [attachmentCursors, setAttachmentCursors] = useState<Array<string | null>>([null])
  const attachmentCursor = attachmentCursors[attachmentCursors.length - 1]
  const relationships = useQuery({ queryKey: policyKeys.identity(credentialId, attachmentCursor), enabled: credentialId.length > 0, queryFn: ({ signal }) => invokeOperation('listAdminIdentityPolicies', { parameters: { path: { credential_id: credentialId }, query: { limit: 100, after_id: attachmentCursor ?? undefined } }, signal }) })
  const [policyId, setPolicyId] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [pending, setPending] = useState(false)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])

  function invalidatePreparation() {
    guard.current.cancel(); setPending(false); setReview(null); setError(null)
  }

  async function prepare(operation: 'attach' | 'detach', attachment?: IdentityPolicyAttachment) {
    if (!credentialId || pending) return
    const selectedPolicy = operation === 'attach' ? policies.data?.items.find(item => item.id === policyId) : attachment
    if (!selectedPolicy) { setError(new Error('Select an available policy')); return }
    const intent = { operation, credentialId, policy: selectedPolicy } as const
    const request = guard.current.begin()
    setPending(true); setError(null)
    try {
      const detail = await invokeOperation('listAdminIdentityPolicies', { parameters: { path: { credential_id: intent.credentialId }, query: { limit: 100 } } })
      if (!guard.current.current(request)) return
      identityPolicyRequest(detail, intent.policy); setReview({ operation: intent.operation, detail, policy: intent.policy })
    } catch (cause) { if (guard.current.current(request)) setError(cause instanceof Error ? cause : new Error('Attachment review failed')) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  async function persist() {
    if (!review || pending) return
    setPending(true); setError(null)
    try {
      const input = { parameters: { path: { credential_id: review.detail.credential_id } }, body: identityPolicyRequest(review.detail, review.policy) }
      if (review.operation === 'attach') await invokeOperation('attachReviewedAdminIdentityPolicy', input)
      else await invokeOperation('detachReviewedAdminIdentityPolicy', input)
      await invalidateControl(client); setReview(null); setPolicyId(''); await relationships.refetch()
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Attachment change failed')); setReview(null)
      if (cause instanceof ApiError && cause.status === 409) { await invalidateControl(client); await relationships.refetch() }
    } finally { setPending(false) }
  }

  const attached = new Set(relationships.data?.items.map(item => item.policy_id) ?? [])
  const reviewPolicyName = review ? 'name' in review.policy ? review.policy.name : review.policy.policy_name : ''
  const reviewPolicyRevision = review ? 'revision' in review.policy ? review.policy.revision : review.policy.policy_revision : 0
  return <section className="policy-section" aria-labelledby="identity-policy-title"><div className="section-heading"><div><h2 id="identity-policy-title">Identity attachments</h2><p>Attach managed policies by stable credential and policy ID. Changes affect the identity's current effective permissions.</p></div><RefreshButton pending={relationships.isFetching} refresh={() => { void relationships.refetch() }} /></div>
    <label className="policy-selector">Identity<select value={credentialId} onChange={event => { invalidatePreparation(); setCredentialId(event.target.value); setPolicyId(''); setPolicyCursors([null]); setAttachmentCursors([null]) }}><option value="">Select identity</option>{identitySelector.items.map(identity => <option key={identity.credential_id} value={identity.credential_id}>{identity.s3_access_key}</option>)}</select></label>
    <IdentitySelectorPagination page={identitySelector.page} pending={identities.isFetching || identitySelector.selectedQuery.isFetching} canPrevious={identitySelector.canPrevious} canNext={identitySelector.canNext} previous={() => { invalidatePreparation(); identitySelector.previous() }} next={() => { invalidatePreparation(); identitySelector.next() }} />
    {identities.isError && <ErrorBanner error={new Error('Identity metadata unavailable')} retry={() => { void identities.refetch() }} />}
    {credentialId && identitySelector.selectedQuery.isError && <ErrorBanner error={new Error('Selected identity metadata unavailable')} retry={() => { void identitySelector.selectedQuery.refetch() }} />}
    {policies.isError && <ErrorBanner error={new Error('Managed policy metadata unavailable')} retry={() => { void policies.refetch() }} />}
    {relationships.isError && <ErrorBanner error={relationships.error} retry={() => { void relationships.refetch() }} />}
    {credentialId && <><div className="policy-attach-row"><label>Managed policy<select value={policyId} onChange={event => { invalidatePreparation(); setPolicyId(event.target.value) }}><option value="">Select policy</option>{policies.data?.items.filter(policy => !attached.has(policy.id)).map(policy => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label><button disabled={!policyId || pending} onClick={() => { void prepare('attach') }}><LinkIcon size={16} />Review attachment</button></div><Pagination label="Policy option" page={policyCursors.length} previous={() => { invalidatePreparation(); setPolicyId(''); setPolicyCursors(value => value.slice(0, -1)) }} next={() => { if (policies.data?.next_after_id) { invalidatePreparation(); setPolicyId(''); setPolicyCursors(value => [...value, policies.data!.next_after_id]) } }} canPrevious={policyCursors.length > 1} canNext={Boolean(policies.data?.next_after_id)} pending={policies.isFetching} /><DataTable rows={relationships.data?.items ?? []} loading={relationships.isPending} rowKey={row => row.policy_id} columns={[{ label: 'Policy', value: row => row.policy_name }, { label: 'Revision', value: row => row.policy_revision }, { label: 'Actions', value: row => <button className="icon-button" title="Detach policy" aria-label={`Detach ${row.policy_name}`} onClick={() => { void prepare('detach', row) }}><Unlink size={16} /></button> }]} /><Pagination label="Attachment" page={attachmentCursors.length} previous={() => { invalidatePreparation(); setAttachmentCursors(value => value.slice(0, -1)) }} next={() => { if (relationships.data?.next_after_id) { invalidatePreparation(); setAttachmentCursors(value => [...value, relationships.data!.next_after_id]) } }} canPrevious={attachmentCursors.length > 1} canNext={Boolean(relationships.data?.next_after_id)} pending={relationships.isFetching} /></>}
    <p className="policy-role-link">IAM role policy attachments use the existing reviewed role workflow. <Link to="/iam-roles">Manage role attachments</Link>.</p>
    {error && <ErrorBanner error={error} retry={credentialId ? () => { void relationships.refetch() } : undefined} />}
    {review?.operation === 'attach' && <Modal title="Confirm: attach policy" description="This adds effective S3 permissions. It does not mutate Azure storage." onClose={() => setReview(null)} pending={pending}><dl className="policy-detail-grid"><dt>Credential ID</dt><dd>{review.detail.credential_id}</dd><dt>Credential revision</dt><dd>{review.detail.credential_revision}</dd><dt>Policy</dt><dd>{reviewPolicyName}</dd><dt>Policy revision</dt><dd>{reviewPolicyRevision}</dd></dl><div className="dialog-actions"><button disabled={pending} onClick={() => setReview(null)}>Back</button><button className="primary" disabled={pending} onClick={() => { void persist() }}>{pending ? 'Applying...' : 'Attach policy'}</button></div></Modal>}
    {review?.operation === 'detach' && <DestructiveDialog title="Detach identity policy" description="Removes this policy from the identity's effective S3 permissions. It does not mutate Azure storage." confirmLabel={`Detach ${reviewPolicyName}`} pending={pending} onClose={() => setReview(null)} onConfirm={() => { void persist() }}><dl className="policy-detail-grid"><dt>Credential ID</dt><dd>{review.detail.credential_id}</dd><dt>Credential revision</dt><dd>{review.detail.credential_revision}</dd><dt>Policy</dt><dd>{reviewPolicyName}</dd><dt>Policy revision</dt><dd>{reviewPolicyRevision}</dd></dl></DestructiveDialog>}
  </section>
}

function Pagination({ label, page, previous, next, canPrevious, canNext, pending }: { label: string; page: number; previous: () => void; next: () => void; canPrevious: boolean; canNext: boolean; pending: boolean }) {
  return <div className="policy-pagination"><button className="icon-button" aria-label={`Previous ${label.toLowerCase()} page`} title="Previous page" disabled={!canPrevious || pending} onClick={previous}><ChevronLeft size={16} /></button><span>{label} page {page}</span><button className="icon-button" aria-label={`Next ${label.toLowerCase()} page`} title="Next page" disabled={!canNext || pending} onClick={next}><ChevronRight size={16} /></button></div>
}