import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api, ApiError } from '../../api/client'
import type { Schema } from '../../api/control'
import { invalidateControl } from '../../api/query-keys'
import { DataTable, DestructiveDialog, ErrorBanner, Modal, RefreshButton } from '../../components/control'
import { completionGuard } from '../operations/state'
import { createPolicyRequest, deletePolicyRequest, emptyPolicyDocument, formatPolicyDocument, policyKeys, updatePolicyRequest, validationRequest, type PolicyDetail, type PolicySummary } from './policy-state'

type Operation = 'create' | 'edit' | 'delete'
type PolicyReview = {
  authoritative: PolicyDetail | null
  request: Schema['AdminPolicyCreateRequest'] | Schema['ReviewPolicyUpdateRequest'] | Schema['ReviewPolicyDeleteRequest']
}

export default function ManagedPolicies() {
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const cursor = cursors[cursors.length - 1]
  const policies = useQuery({ queryKey: policyKeys.managedList(cursor), queryFn: async () => {
    const page = await api<Schema['AdminPolicyPage']>(`/admin/ui/policies?limit=100${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ''}`)
    if (!Array.isArray(page.items) || page.items.length > page.max_page_size) throw new Error('Invalid managed policy page')
    return page
  } })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detail = useQuery({ queryKey: policyKeys.managedDetail(selectedId ?? ''), enabled: selectedId !== null, queryFn: () => api<PolicyDetail>(`/admin/ui/policies/${encodeURIComponent(selectedId!)}`) })
  const [operation, setOperation] = useState<Operation | null>(null)

  function select(policy: PolicySummary) { setSelectedId(policy.id); setOperation(null) }
  return <section className="policy-section" aria-labelledby="managed-policy-title">
    <div className="section-heading"><div><h2 id="managed-policy-title">Managed policies</h2><p>Names are immutable after creation. Permission changes affect attached identities and active role sessions.</p></div><div className="page-actions"><RefreshButton pending={policies.isFetching || detail.isFetching} refresh={() => { void policies.refetch(); if (selectedId) void detail.refetch() }} /><button className="primary" onClick={() => setOperation('create')}><Plus size={16} />Create policy</button></div></div>
    {policies.isError && <ErrorBanner error={policies.error} retry={() => { void policies.refetch() }} />}
    <DataTable rows={policies.data?.items ?? []} loading={policies.isPending} rowKey={row => row.id} columns={[
      { label: 'Name', value: row => <strong>{row.name}</strong> },
      { label: 'Revision', value: row => row.revision },
      { label: 'Attachments', value: row => `${row.credential_attachment_count} identities / ${row.role_attachment_count} roles` },
      { label: 'Protection', value: row => row.deletable ? 'Operator managed' : 'Built in' },
      { label: 'Actions', value: row => <button className="icon-button" aria-label={`View ${row.name}`} title="View policy" onClick={() => select(row)}><Eye size={16} /></button> },
    ]} />
    <div className="policy-pagination"><button className="icon-button" aria-label="Previous policy page" title="Previous policy page" disabled={cursors.length === 1 || policies.isFetching} onClick={() => setCursors(value => value.slice(0, -1))}><ChevronLeft size={16} /></button><span>Page {cursors.length}</span><button className="icon-button" aria-label="Next policy page" title="Next policy page" disabled={!policies.data?.next_after_id || policies.isFetching} onClick={() => { if (policies.data?.next_after_id) setCursors(value => [...value, policies.data!.next_after_id]) }}><ChevronRight size={16} /></button></div>
    {selectedId && <section className="policy-detail" aria-label="Managed policy detail"><div className="section-heading"><h2>{detail.data?.policy.name ?? 'Policy detail'}</h2><button className="icon-button" aria-label="Close policy detail" title="Close detail" onClick={() => setSelectedId(null)}><X size={16} /></button></div>
      {detail.isError && <ErrorBanner error={detail.error} retry={() => { void detail.refetch() }} />}
      {detail.isPending && <p role="status">Loading policy...</p>}
      {detail.data && <><dl className="policy-detail-grid"><dt>Policy ID</dt><dd>{detail.data.policy.id}</dd><dt>Name</dt><dd>{detail.data.policy.name}</dd><dt>Description</dt><dd>{detail.data.policy.description ?? 'None'}</dd><dt>Revision</dt><dd>{detail.data.policy.revision}</dd><dt>Identity attachments</dt><dd>{detail.data.policy.credential_attachment_count}</dd><dt>Role attachments</dt><dd>{detail.data.policy.role_attachment_count}</dd><dt>Protection</dt><dd>{detail.data.policy.deletable ? 'Deletable' : 'Built in and protected'}</dd></dl><pre className="policy-document">{formatPolicyDocument(detail.data.document)}</pre><div className="policy-actions"><button onClick={() => setOperation('edit')}><Pencil size={16} />Edit policy</button><button className="danger" disabled={!detail.data.policy.deletable} onClick={() => setOperation('delete')}><Trash2 size={16} />Delete policy</button></div></>}
    </section>}
    {operation && <PolicyDialog operation={operation} initial={operation === 'create' ? undefined : detail.data} close={() => setOperation(null)} changed={changed => { setOperation(null); setCursors([null]); if (changed) setSelectedId(changed.policy.id); else setSelectedId(null) }} />}
  </section>
}

function PolicyDialog({ operation, initial, close, changed }: { operation: Operation; initial?: PolicyDetail; close: () => void; changed: (detail: PolicyDetail | null) => void }) {
  const client = useQueryClient()
  const [name] = useState(initial?.policy.name ?? '')
  const [draftName, setDraftName] = useState(name)
  const [description, setDescription] = useState(initial?.policy.description ?? '')
  const [document, setDocument] = useState(initial ? formatPolicyDocument(initial.document) : emptyPolicyDocument)
  const [review, setReview] = useState<PolicyReview | null>(null)
  const [validation, setValidation] = useState<Schema['AdminPolicyDraftValidationResponse'] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [stale, setStale] = useState(false)
  const [pending, setPending] = useState(false)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])
  const title = operation === 'create' ? 'Create managed policy' : operation === 'edit' ? `Edit ${name}` : `Delete ${name}`

  function changeDraft(change: () => void) {
    guard.current.cancel()
    setPending(false)
    setReview(null)
    setValidation(null)
    setError(null)
    change()
  }

  async function prepare(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); if (pending) return
    const request = guard.current.begin()
    setPending(true); setError(null); setStale(false)
    try {
      const createRequest = operation === 'create' ? createPolicyRequest(draftName, description, document) : null
      if (operation !== 'delete') {
        const result = await api<Schema['AdminPolicyDraftValidationResponse']>('/admin/ui/policies/validate', { method: 'POST', body: JSON.stringify(validationRequest(document, 'managed_policy')) })
        if (!guard.current.current(request)) return
        setValidation(result)
        if (!result.valid) throw new Error('Resolve the server validation findings before review')
      }
      if (operation === 'create') {
        if (!createRequest) throw new Error('Policy review is unavailable')
        setReview({ authoritative: null, request: createRequest })
      }
      else {
        if (!initial) throw new Error('Policy review is unavailable')
        const authoritative = await api<PolicyDetail>(`/admin/ui/policies/${encodeURIComponent(initial.policy.id)}`)
        if (!guard.current.current(request)) return
        setReview({ authoritative, request: operation === 'edit' ? updatePolicyRequest(authoritative, description, document) : deletePolicyRequest(authoritative) })
      }
    } catch (cause) { if (guard.current.current(request)) setError(cause instanceof Error ? cause : new Error('Policy review failed')) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  async function persist() {
    if (!review || pending) return
    const request = guard.current.begin()
    setPending(true); setError(null)
    try {
      let result: PolicyDetail | null
      if (operation === 'create') result = await api<PolicyDetail>('/admin/ui/policies', { method: 'POST', body: JSON.stringify(review.request) })
      else {
        if (!review.authoritative) throw new Error('Policy review is unavailable')
        const response = await api<Schema['AdminPolicyMutationResult']>(`/admin/ui/policies/${encodeURIComponent(review.authoritative.policy.id)}`, { method: operation === 'edit' ? 'PUT' : 'DELETE', body: JSON.stringify(review.request) })
        result = response.detail
      }
      if (!guard.current.current(request)) return
      await invalidateControl(client); changed(result)
    } catch (cause) {
      if (!guard.current.current(request)) return
      setError(cause instanceof Error ? cause : new Error('Policy change failed'))
      setReview(null)
      if (cause instanceof ApiError && cause.status === 409) { setStale(true); await invalidateControl(client) }
    } finally { if (guard.current.current(request)) setPending(false) }
  }

  if (operation === 'delete' && review?.authoritative) return <DestructiveDialog title={title} description="Permanently removes this managed policy after authoritative attachment impact review. Azure containers, blobs, and routing are unchanged." confirmLabel={`Delete ${review.authoritative.policy.name}`} pending={pending} onClose={() => setReview(null)} onConfirm={() => { void persist() }}>
    {error && <ErrorBanner error={error} />}
    <dl className="policy-detail-grid"><dt>Name</dt><dd>{review.authoritative.policy.name}</dd><dt>Reviewed revision</dt><dd>{review.authoritative.policy.revision}</dd><dt>Identity impact</dt><dd>{review.authoritative.policy.credential_attachment_count} attachments</dd><dt>Role impact</dt><dd>{review.authoritative.policy.role_attachment_count} attachments and active sessions</dd></dl>
  </DestructiveDialog>

  return <Modal title={review ? `Confirm: ${title}` : title} description="This changes S3 authorization metadata only. Azure containers, blobs, and routing are unchanged." onClose={close} pending={pending}>
    {error && <ErrorBanner error={error} retry={stale ? () => { void prepare() } : undefined} />}
    {stale && <p className="policy-notice" role="status">The review was stale. Authoritative state was refreshed; your unsaved draft is preserved for another review.</p>}
    {review ? <><dl className="policy-detail-grid"><dt>Name</dt><dd>{operation === 'create' ? draftName : review.authoritative?.policy.name ?? name}</dd>{operation !== 'delete' && <><dt>Description</dt><dd>{description || 'None'}</dd><dt>Validated bytes</dt><dd>{validation?.json_bytes ?? 'Unavailable'}</dd><dt>Statements</dt><dd>{validation?.statements ?? 'Unavailable'}</dd></>}{review.authoritative && <><dt>Reviewed revision</dt><dd>{review.authoritative.policy.revision}</dd><dt>Identity impact</dt><dd>{review.authoritative.policy.credential_attachment_count} attachments</dd><dt>Role impact</dt><dd>{review.authoritative.policy.role_attachment_count} attachments and active sessions</dd></>}</dl><div className="dialog-actions"><button disabled={pending} onClick={() => setReview(null)}>Back</button><button className="primary" disabled={pending} onClick={() => { void persist() }}>{pending ? 'Applying...' : 'Confirm change'}</button></div></>
      : <form className="operation-form" onSubmit={event => { void prepare(event) }}>{operation === 'create' ? <label>Policy name<input required value={draftName} onChange={event => changeDraft(() => setDraftName(event.target.value))} /></label> : <label>Policy name<input value={name} readOnly aria-readonly="true" /></label>}{operation !== 'delete' && <><label>Description<input value={description} onChange={event => changeDraft(() => setDescription(event.target.value))} /></label><label>Policy document<textarea className="policy-editor" required spellCheck={false} value={document} onChange={event => changeDraft(() => setDocument(event.target.value))} /></label>{validation && !validation.valid && <ul className="policy-violations">{validation.violations.map((item, index) => <li key={`${item.code}-${index}`}><strong>{item.field}</strong>: {item.message}</li>)}</ul>}</>}{operation === 'delete' && initial && <p>Review deletion impact for {initial.policy.credential_attachment_count} identity and {initial.policy.role_attachment_count} role attachments.</p>}<div className="dialog-actions"><button type="button" disabled={pending} onClick={close}>Cancel</button><button className={operation === 'delete' ? 'danger' : 'primary'} disabled={pending}>{pending ? 'Validating...' : 'Review change'}</button></div></form>}
  </Modal>
}