import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Link as LinkIcon, Unlink } from 'lucide-react'
import { Link } from 'react-router'
import { api, ApiError } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { invalidateControl } from '../../api/query-keys'
import { DataTable, ErrorBanner, Modal, RefreshButton } from '../../components/control'
import { identityPolicyRequest, policyKeys, type IdentityPolicyAttachment, type IdentityPolicyReview, type PolicySummary } from './policy-state'

type Review = { operation: 'attach' | 'detach'; detail: IdentityPolicyReview; policy: PolicySummary | IdentityPolicyAttachment }

export default function IdentityPolicies() {
  const client = useQueryClient()
  const identities = useQuery(controlQueries.identities)
  const [policyCursors, setPolicyCursors] = useState<Array<string | null>>([null])
  const policyCursor = policyCursors[policyCursors.length - 1]
  const policies = useQuery({ queryKey: policyKeys.managedList(policyCursor), queryFn: () => api<Schema['AdminPolicyPage']>(`/admin/ui/policies?limit=100${policyCursor ? `&after_id=${encodeURIComponent(policyCursor)}` : ''}`) })
  const [credentialId, setCredentialId] = useState('')
  const [attachmentCursors, setAttachmentCursors] = useState<Array<string | null>>([null])
  const attachmentCursor = attachmentCursors[attachmentCursors.length - 1]
  const relationships = useQuery({ queryKey: policyKeys.identity(credentialId, attachmentCursor), enabled: credentialId.length > 0, queryFn: () => api<Schema['AdminIdentityPolicyPage']>(`/admin/ui/identities/${encodeURIComponent(credentialId)}/policies?limit=100${attachmentCursor ? `&after_id=${encodeURIComponent(attachmentCursor)}` : ''}`) })
  const [policyId, setPolicyId] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [pending, setPending] = useState(false)

  async function prepare(operation: 'attach' | 'detach', attachment?: IdentityPolicyAttachment) {
    if (!credentialId || pending) return
    setPending(true); setError(null)
    try {
      const detail = await api<Schema['AdminIdentityPolicyPage']>(`/admin/ui/identities/${encodeURIComponent(credentialId)}/policies?limit=100`)
      const policy = operation === 'attach' ? policies.data?.items.find(item => item.id === policyId) : attachment
      if (!policy) throw new Error('Select an available policy')
      identityPolicyRequest(detail, policy); setReview({ operation, detail, policy })
    } catch (cause) { setError(cause instanceof Error ? cause : new Error('Attachment review failed')) }
    finally { setPending(false) }
  }

  async function persist() {
    if (!review || pending) return
    setPending(true); setError(null)
    try {
      await api<Schema['AdminIdentityPolicyMutationResult']>(`/admin/ui/identities/${encodeURIComponent(review.detail.credential_id)}/policies`, { method: review.operation === 'attach' ? 'POST' : 'DELETE', body: JSON.stringify(identityPolicyRequest(review.detail, review.policy)) })
      await invalidateControl(client); setReview(null); setPolicyId(''); await relationships.refetch()
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Attachment change failed')); setReview(null)
      if (cause instanceof ApiError && cause.status === 409) { await invalidateControl(client); await relationships.refetch() }
    } finally { setPending(false) }
  }

  const attached = new Set(relationships.data?.items.map(item => item.policy_id) ?? [])
  return <section className="policy-section" aria-labelledby="identity-policy-title"><div className="section-heading"><div><h2 id="identity-policy-title">Identity attachments</h2><p>Attach managed policies by stable credential and policy ID. Changes affect the identity's current effective permissions.</p></div><RefreshButton pending={relationships.isFetching} refresh={() => { void relationships.refetch() }} /></div>
    <label className="policy-selector">Identity<select value={credentialId} onChange={event => { setCredentialId(event.target.value); setPolicyId(''); setPolicyCursors([null]); setAttachmentCursors([null]); setReview(null); setError(null) }}><option value="">Select identity</option>{identities.data?.filter(identity => identity.credential_id).map(identity => <option key={identity.credential_id!} value={identity.credential_id!}>{identity.s3_access_key}</option>)}</select></label>
    {identities.isError && <ErrorBanner error={new Error('Identity metadata unavailable')} retry={() => { void identities.refetch() }} />}
    {policies.isError && <ErrorBanner error={new Error('Managed policy metadata unavailable')} retry={() => { void policies.refetch() }} />}
    {relationships.isError && <ErrorBanner error={relationships.error} retry={() => { void relationships.refetch() }} />}
    {credentialId && <><div className="policy-attach-row"><label>Managed policy<select value={policyId} onChange={event => setPolicyId(event.target.value)}><option value="">Select policy</option>{policies.data?.items.filter(policy => !attached.has(policy.id)).map(policy => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label><button disabled={!policyId || pending} onClick={() => { void prepare('attach') }}><LinkIcon size={16} />Review attachment</button></div><Pagination label="Policy option" page={policyCursors.length} previous={() => { setPolicyId(''); setPolicyCursors(value => value.slice(0, -1)) }} next={() => { if (policies.data?.next_after_id) { setPolicyId(''); setPolicyCursors(value => [...value, policies.data!.next_after_id]) } }} canPrevious={policyCursors.length > 1} canNext={Boolean(policies.data?.next_after_id)} pending={policies.isFetching} /><DataTable rows={relationships.data?.items ?? []} loading={relationships.isPending} rowKey={row => row.policy_id} columns={[{ label: 'Policy', value: row => row.policy_name }, { label: 'Revision', value: row => row.policy_revision }, { label: 'Actions', value: row => <button className="icon-button" title="Detach policy" aria-label={`Detach ${row.policy_name}`} onClick={() => { void prepare('detach', row) }}><Unlink size={16} /></button> }]} /><Pagination label="Attachment" page={attachmentCursors.length} previous={() => setAttachmentCursors(value => value.slice(0, -1))} next={() => { if (relationships.data?.next_after_id) setAttachmentCursors(value => [...value, relationships.data!.next_after_id]) }} canPrevious={attachmentCursors.length > 1} canNext={Boolean(relationships.data?.next_after_id)} pending={relationships.isFetching} /></>}
    <p className="policy-role-link">IAM role policy attachments use the existing reviewed role workflow. <Link to="/iam-roles">Manage role attachments</Link>.</p>
    {error && <ErrorBanner error={error} retry={credentialId ? () => { void relationships.refetch() } : undefined} />}
    {review && <Modal title={`Confirm: ${review.operation} policy`} description="This changes effective S3 permissions. It does not mutate Azure storage." onClose={() => { if (!pending) setReview(null) }}><dl className="policy-detail-grid"><dt>Credential ID</dt><dd>{review.detail.credential_id}</dd><dt>Credential revision</dt><dd>{review.detail.credential_revision}</dd><dt>Policy</dt><dd>{'name' in review.policy ? review.policy.name : review.policy.policy_name}</dd><dt>Policy revision</dt><dd>{'revision' in review.policy ? review.policy.revision : review.policy.policy_revision}</dd></dl><div className="dialog-actions"><button disabled={pending} onClick={() => setReview(null)}>Back</button><button className="primary" disabled={pending} onClick={() => { void persist() }}>{pending ? 'Applying...' : 'Confirm change'}</button></div></Modal>}
  </section>
}

function Pagination({ label, page, previous, next, canPrevious, canNext, pending }: { label: string; page: number; previous: () => void; next: () => void; canPrevious: boolean; canNext: boolean; pending: boolean }) {
  return <div className="policy-pagination"><button className="icon-button" aria-label={`Previous ${label.toLowerCase()} page`} title="Previous page" disabled={!canPrevious || pending} onClick={previous}><ChevronLeft size={16} /></button><span>{label} page {page}</span><button className="icon-button" aria-label={`Next ${label.toLowerCase()} page`} title="Next page" disabled={!canNext || pending} onClick={next}><ChevronRight size={16} /></button></div>
}