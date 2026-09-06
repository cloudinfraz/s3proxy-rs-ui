import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { controlKeys, invalidateControl } from '../../api/query-keys'
import { DataTable, ErrorBanner, Modal, Page, RefreshButton } from '../../components/control'
import { completionGuard } from '../operations/state'
import { createMappingPayload, draftError, effectiveTarget, mappingDraft, reviewedRoutingContext, updateMappingPayload, type Mapping, type MappingDraft, type RoutingContext } from './routing'
import './buckets.css'

type Summary = Schema['VirtualMappingSummary']
type Operation = 'create' | 'edit' | 'detail' | 'delete'
type Review = { draft: MappingDraft; revision?: number; context: RoutingContext }

export default function VirtualMappingsPage() {
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const cursor = cursors[cursors.length - 1]
  const mappings = useQuery({ queryKey: [...controlKeys.list('buckets'), 'page', cursor], queryFn: async () => {
    const result = await api<Schema['VirtualMappingPage']>(`/admin/ui/virtual-buckets?limit=100${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ''}`)
    if (!result || !Array.isArray(result.items) || result.items.length > 100 || !(result.next_after_id === null || typeof result.next_after_id === 'string')) throw new Error('Invalid mapping page response')
    return result
  } })
  const identities = useQuery(controlQueries.identities)
  const backends = useQuery(controlQueries.backends)
  const capabilities = useQuery(controlQueries.capabilities)
  const client = useQueryClient()
  const [operation, setOperation] = useState<Operation | null>(null)
  const [selected, setSelected] = useState<Mapping | null>(null)
  const [draft, setDraft] = useState<MappingDraft>(mappingDraft())
  const [review, setReview] = useState<Review | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [stale, setStale] = useState(false)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])
  const context: RoutingContext | null = identities.data && backends.data && capabilities.data && !identities.isError && !backends.isError && !capabilities.isError
    ? reviewedRoutingContext({ identities: identities.data, backends: backends.data, capabilities: capabilities.data }, selected) : null

  function dismiss() {
    guard.current.cancel(); setOperation(null); setSelected(null); setReview(null); setPending(false); setError(null); setStale(false)
  }

  function report(cause: unknown, request: number) {
    if (!guard.current.current(request)) return
    setError(new Error(cause instanceof Error ? cause.message : 'Mapping request failed'))
    if (cause instanceof ApiError && cause.status === 409) setStale(true)
  }

  async function open(kind: Exclude<Operation, 'create'>, id: string) {
    dismiss(); setOperation(kind)
    const request = guard.current.begin(); setPending(true)
    try {
      const current = await api<Mapping>(`/admin/ui/virtual-buckets/${encodeURIComponent(id)}`)
      if (!guard.current.current(request)) return
      setSelected(current); setDraft(mappingDraft(current))
    } catch (cause) { report(cause, request) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || stale || !context) return
    const validation = draftError(draft, context, selected ?? undefined)
    if (validation) { setError(new Error(validation)); return }
    const request = guard.current.begin(); setPending(true); setError(null)
    try {
      let revision: number | undefined
      let reviewedContext = context
      if (draft.backend && draft.backend !== selected?.backend_id) {
        const backend = await api<Schema['VirtualMappingBackendReview']>(`/admin/ui/mapping-backends/${encodeURIComponent(draft.backend)}`)
        if (backend.id !== draft.backend || !backend.enabled || !context.capabilities.usable_registry_auth_modes.includes(backend.auth_mode as Schema['BackendAuthMode'])) throw new Error('Selected backend is unavailable')
        revision = backend.revision
        reviewedContext = { ...context, backends: context.backends.map(item => item.id === backend.id ? { ...item, azure_account: backend.azure_account } : item) }
      }
      if (guard.current.current(request)) setReview({ draft: { ...draft }, revision, context: reviewedContext })
    } catch (cause) { report(cause, request) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  async function persist() {
    if (pending || stale || (operation !== 'delete' && !review)) return
    const request = guard.current.begin(); setPending(true); setError(null)
    try {
      if (operation === 'delete' && selected) {
        await api(`/admin/ui/virtual-buckets/${encodeURIComponent(selected.id)}`, { method: 'DELETE', body: JSON.stringify({ expected_impact_token: selected.impact_token } satisfies Schema['DeleteVirtualMapping']) })
      } else if (review) {
        await api<Mapping>(selected ? `/admin/ui/virtual-buckets/${encodeURIComponent(selected.id)}` : '/admin/ui/virtual-buckets', {
          method: selected ? 'PUT' : 'POST', body: JSON.stringify(selected ? updateMappingPayload(review.draft, selected, review.revision) : createMappingPayload(review.draft, review.revision)),
        })
      }
      await invalidateControl(client)
      if (guard.current.current(request)) { dismiss(); setCursors([null]) }
    } catch (cause) { report(cause, request) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  function target(value: MappingDraft, currentContext: RoutingContext | null) {
    if (!currentContext) return 'Routing metadata unavailable'
    const result = effectiveTarget(currentContext.identities.find(item => item.credential_id === value.owner), value.backend || null, currentContext)
    return `${result.source}: ${result.account || 'Unavailable'} / ${value.container || 'Not set'}${result.blocked ? ` (${result.blocked})` : ''}`
  }
  const owner = identities.data?.find(item => item.credential_id === draft.owner)
  const title = stale ? 'Mapping review expired' : review ? 'Confirm mapping change' : operation === 'create' ? 'Add bucket routing' : operation === 'edit' ? 'Edit mapping' : operation === 'delete' ? 'Remove mapping' : 'Mapping details'
  const update = (field: keyof MappingDraft, value: string | boolean) => setDraft(current => ({ ...current, [field]: value }))
  return <Page title="Bucket routing" action={<div className="page-actions"><RefreshButton pending={mappings.isFetching} refresh={() => { void mappings.refetch() }} /><button className="primary" disabled={!context} onClick={() => { dismiss(); setDraft(mappingDraft()); setOperation('create') }}><Plus size={17} /> Add bucket routing</button></div>}>
    {[mappings, identities, backends, capabilities].map((query, index) => query.isError && <ErrorBanner key={index} error={query.error} retry={() => { void query.refetch() }} />)}
    {(!mappings.isError || mappings.data) && <DataTable rows={mappings.data?.items ?? []} rowKey={row => row.id} loading={mappings.isPending} columns={[
      { label: 'S3 bucket', value: row => row.virtual_bucket_name },
      { label: 'Container', value: row => row.azure_container },
      { label: 'Identity', value: row => identities.data?.find(item => item.credential_id === row.credential_id)?.s3_access_key ?? row.credential_id },
      { label: 'Status', value: row => row.enabled ? 'Enabled' : 'Disabled' },
      { label: 'Actions', value: (row: Summary) => <div className="row-actions"><button className="icon-button" title="View mapping details" aria-label={`View ${row.virtual_bucket_name}`} onClick={() => { void open('detail', row.id) }}><Eye size={16} /></button><button className="icon-button" title="Edit mapping" aria-label={`Edit ${row.virtual_bucket_name}`} disabled={!context} onClick={() => { void open('edit', row.id) }}><Pencil size={16} /></button><button className="icon-button danger" title="Remove mapping" aria-label={`Remove ${row.virtual_bucket_name}`} onClick={() => { void open('delete', row.id) }}><Trash2 size={16} /></button></div> },
    ]} />}
    <div className="mapping-pagination"><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={cursors.length === 1 || mappings.isFetching} onClick={() => setCursors(current => current.slice(0, -1))}><ChevronLeft size={16} /></button><span>Page {cursors.length}</span><button className="icon-button" title="Next page" aria-label="Next page" disabled={!mappings.data?.next_after_id || mappings.isFetching} onClick={() => { if (mappings.data?.next_after_id) setCursors(current => [...current, mappings.data.next_after_id]) }}><ChevronRight size={16} /></button></div>
    {operation && <Modal title={title} description={operation === 'delete' ? 'Removes only this owned mapping and its scoped policy. Azure containers, blobs and native versions are retained.' : 'Routing metadata only. Changes do not move data or verify Azure access.'} onClose={dismiss}>
      {error && <ErrorBanner error={error} />}
      {stale ? <div className="dialog-actions"><button onClick={dismiss}>Cancel</button><button className="primary" disabled={pending} onClick={() => { if (selected) void open(operation === 'delete' ? 'delete' : 'edit', selected.id); else { dismiss(); void invalidateControl(client) } }}>Reload and review</button></div>
        : (operation === 'create' || (operation === 'edit' && selected)) && !review ? <form className="operation-form" onSubmit={event => { void prepare(event) }}>
          <label>S3 bucket<input required value={draft.alias} readOnly={Boolean(selected)} onChange={event => update('alias', event.target.value)} /></label>
          <label>Azure container<input required value={draft.container} onChange={event => update('container', event.target.value)} /></label>
          <label>Identity<select required disabled={Boolean(selected)} value={draft.owner} onChange={event => update('owner', event.target.value)}><option value="">Select virtual identity</option>{identities.data?.filter(item => item.access_mode === 'virtual').map(item => <option key={item.credential_id} value={item.credential_id} disabled={!item.enabled}>{item.s3_access_key}{!item.enabled ? ' (disabled)' : ''}</option>)}</select></label>
          <label>Backend override<select value={draft.backend} disabled={!capabilities.data?.backend_routing_enabled} onChange={event => update('backend', event.target.value)}><option value="">Inherit identity default</option>{draft.backend && !backends.data?.some(item => item.id === draft.backend) && <option value={draft.backend}>Missing backend ({draft.backend})</option>}{backends.data?.map(item => <option key={item.id} value={item.id} disabled={!item.enabled || !capabilities.data?.usable_registry_auth_modes.includes(item.auth_mode)}>{item.name} / {item.azure_account}{!item.enabled ? ' (disabled)' : ''}</option>)}</select></label>
          <label>Endpoint prefix<input value={draft.prefix} onChange={event => update('prefix', event.target.value)} /></label>
          {selected && <label className="checkbox-field"><input type="checkbox" checked={draft.enabled} onChange={event => update('enabled', event.target.checked)} /> Enabled</label>}
          <p className="mapping-target">{target(draft, context)}</p>
          <div className="dialog-actions"><button type="button" onClick={dismiss}>Cancel</button><button className="primary" disabled={pending || !context}>{pending ? 'Loading review...' : 'Review changes'}</button></div>
        </form> : review ? <><dl className="mapping-detail"><dt>Alias</dt><dd>{review.draft.alias}</dd><dt>Previous target</dt><dd>{selected ? target(mappingDraft(selected), review.context) : 'New mapping'}</dd><dt>New target</dt><dd>{target(review.draft, review.context)}</dd><dt>Endpoint prefix</dt><dd>{selected?.endpoint_prefix ?? 'None'} to {review.draft.prefix || 'None'}</dd><dt>Status</dt><dd>{selected ? selected.enabled ? 'Enabled' : 'Disabled' : 'New'} to {review.draft.enabled ? 'Enabled' : 'Disabled'}</dd><dt>Owner references</dt><dd>{owner?.virtual_bucket_count ?? 'Unknown'} mappings / {owner?.policy_attachment_count ?? 'Unknown'} policy attachments</dd></dl><p>Only this mapping changes. Other mappings and existing Azure data are retained.</p><div className="dialog-actions"><button disabled={pending} onClick={() => { setReview(null); setError(null) }}>Back</button><button className="primary" disabled={pending} onClick={() => { void persist() }}>{pending ? 'Saving...' : 'Confirm change'}</button></div></>
          : selected ? <><dl className="mapping-detail"><dt>Mapping ID</dt><dd>{selected.id}</dd><dt>S3 bucket</dt><dd>{selected.virtual_bucket_name}</dd><dt>Owner ID</dt><dd>{selected.credential_id}</dd><dt>Effective target</dt><dd>{target(mappingDraft(selected), context)}</dd><dt>Identity default backend</dt><dd>{selected.credential_default_backend_id ?? 'Legacy account'}</dd><dt>Endpoint prefix</dt><dd>{selected.endpoint_prefix ?? 'None'}</dd><dt>Status</dt><dd>{selected.enabled ? 'Enabled' : 'Disabled'}</dd></dl><div className="dialog-actions"><button onClick={dismiss}>{operation === 'delete' ? 'Cancel' : 'Close'}</button>{operation === 'delete' && <button className="primary" disabled={pending} onClick={() => { void persist() }}>{pending ? 'Removing...' : 'Remove mapping'}</button>}</div></> : <p role="status">{pending ? 'Loading mapping...' : 'Mapping unavailable'}</p>}
    </Modal>}
  </Page>
}