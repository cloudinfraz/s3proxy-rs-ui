import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { invalidateControl } from '../../api/query-keys'
import { DataTable, DestructiveDialog, ErrorBanner, Modal, Page, RefreshButton } from '../../components/control'
import { completionGuard } from '../operations/state'
import { backendPayload, requiresImpactConfirmation, reviewedBackendPayload } from './payloads'
import { BackendDetails } from './BackendDetails'

type Backend = Schema['StorageBackendProjection']
type BackendRequest = Schema['StorageBackendRequest']
type Action = { backend: Backend; kind: 'edit' | 'delete' | 'detail' }

const authLabels: Record<Schema['BackendAuthMode'], string> = {
  managed_identity: 'Managed Identity',
  account_key: 'Account key reference',
  sas_token: 'Static SAS reference',
}

export default function BackendsPage() {
  const backends = useQuery(controlQueries.backends)
  const capabilities = useQuery(controlQueries.capabilities)
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [impactRequest, setImpactRequest] = useState<BackendRequest | null>(null)
  const [reviewingImpact, setReviewingImpact] = useState(false)
  const [formAuthMode, setFormAuthMode] = useState<Schema['BackendAuthMode']>('managed_identity')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [reviewRequired, setReviewRequired] = useState(false)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])

  function dismiss() {
    guard.current.cancel()
    setCreating(false)
    setAction(null)
    setImpactRequest(null)
    setReviewingImpact(false)
    setFormAuthMode('managed_identity')
    setPending(false)
    setError(null)
    setReviewRequired(false)
  }

  function report(cause: unknown, operation: string, request: number) {
    if (!guard.current.current(request)) return
    const detail = cause instanceof ApiError ? cause.message : operation
    setError(new Error(`${operation} failed${cause instanceof ApiError ? ` (HTTP ${cause.status}): ${detail}` : ''}`))
  }

  async function persist(payload: BackendRequest, existing?: Backend) {
    if (pending || reviewRequired) return
    const request = guard.current.begin()
    setPending(true)
    setError(null)
    try {
      await api<Schema['StorageBackendResponse']>(existing
        ? `/admin/ui/backends/${encodeURIComponent(existing.name)}`
        : '/admin/ui/backends', {
        method: existing ? 'PUT' : 'POST',
        body: JSON.stringify(existing ? reviewedBackendPayload(payload, existing) : payload),
      })
      await invalidateControl(queryClient)
      if (guard.current.current(request)) dismiss()
    } catch (cause) {
      if (existing && cause instanceof ApiError && cause.status === 409 && guard.current.current(request)) setReviewRequired(true)
      report(cause, existing ? 'Backend update' : 'Backend creation', request)
    }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  async function reloadForReview() {
    if (action?.kind !== 'edit' || pending) return
    const request = guard.current.begin()
    setPending(true)
    try {
      const current = await api<Backend>(`/admin/ui/backends/${encodeURIComponent(action.backend.name)}`)
      if (!guard.current.current(request)) return
      setAction({ backend: current, kind: 'edit' })
      setFormAuthMode(current.auth_mode)
      setImpactRequest(null)
      setReviewingImpact(false)
      setReviewRequired(false)
      setError(null)
    } catch (cause) { report(cause, 'Backend reload', request) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const payload = backendPayload({
      name: String(form.get('name')),
      azureAccount: String(form.get('azure_account')),
      authMode: String(form.get('auth_mode')) as Schema['BackendAuthMode'],
      managedIdentityClientId: String(form.get('managed_identity_client_id') ?? ''),
      userDelegationSasEnabled: form.get('user_delegation_sas_enabled') === 'on',
      secretRef: String(form.get('secret_ref') ?? ''),
      regionLabel: String(form.get('region_label') ?? ''),
      enabled: form.get('enabled') === 'on',
    })
    if (action?.kind === 'edit' && requiresImpactConfirmation(action.backend, payload)) {
      setImpactRequest(payload)
      setReviewingImpact(true)
      return
    }
    void persist(payload, action?.kind === 'edit' ? action.backend : undefined)
  }

  async function remove() {
    if (action?.kind !== 'delete' || pending) return
    const request = guard.current.begin()
    setPending(true)
    setError(null)
    try {
      await api(`/admin/backends/${encodeURIComponent(action.backend.name)}`, { method: 'DELETE' })
      await invalidateControl(queryClient)
      if (guard.current.current(request)) dismiss()
    } catch (cause) { report(cause, 'Backend deletion', request) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  const modes = capabilities.data?.usable_registry_auth_modes ?? []
  const selected = action?.kind === 'edit' && !reviewRequired ? action.backend : null
  const references = (backend: Backend) => `${backend.credential_default_count} identities / ${backend.virtual_bucket_count} mappings`

  return <Page title="Azure backends" subtitle="Managed Identity routing registrations and their control-plane references" action={<div className="page-actions"><RefreshButton pending={backends.isFetching} refresh={() => { void backends.refetch() }} /><button className="primary" disabled={!capabilities.data?.backend_routing_enabled || modes.length === 0} onClick={() => { dismiss(); setFormAuthMode(modes[0]); setCreating(true) }}><Plus size={17} /> Register backend</button></div>}>
    {backends.isError && <ErrorBanner error={backends.error} retry={() => { void backends.refetch() }} />}
    {capabilities.isError && <ErrorBanner error={capabilities.error} retry={() => { void capabilities.refetch() }} />}
    {capabilities.data && !capabilities.data.backend_routing_enabled && <p className="empty-state">Backend routing is disabled for this deployment.</p>}
    {(!backends.isError || backends.data) && <DataTable rows={backends.data ?? []} rowKey={backend => backend.id} loading={backends.isPending} columns={[
      { label: 'Name', value: backend => backend.name },
      { label: 'Azure account', value: backend => backend.azure_account },
      { label: 'Authentication', value: backend => authLabels[backend.auth_mode] },
      { label: 'Identity', value: backend => backend.auth_mode === 'managed_identity' ? backend.managed_identity_client_id ?? 'System / workload identity' : 'Not applicable' },
      { label: 'Status', value: backend => backend.enabled ? 'Enabled' : 'Disabled' },
      { label: 'References', value: references },
      { label: 'Actions', value: backend => <div className="row-actions"><button className="icon-button" title="View backend details" aria-label={`View ${backend.name}`} onClick={() => { dismiss(); setAction({ backend, kind: 'detail' }) }}><Eye size={16} /></button><button className="icon-button" title={modes.includes(backend.auth_mode) ? 'Edit backend' : 'Authentication mode is unavailable'} aria-label={`Edit ${backend.name}`} disabled={!modes.includes(backend.auth_mode)} onClick={() => { dismiss(); setFormAuthMode(backend.auth_mode); setAction({ backend, kind: 'edit' }) }}><Pencil size={16} /></button><button className="icon-button danger" title="Delete backend" aria-label={`Delete ${backend.name}`} onClick={() => { dismiss(); setAction({ backend, kind: 'delete' }) }}><Trash2 size={16} /></button></div> },
    ]} />}
    {(creating || selected) && !reviewingImpact && <Modal title={selected ? 'Edit backend' : 'Register backend'} description="Stores routing metadata only and does not probe or modify Azure storage." onClose={dismiss} pending={pending}><form className="operation-form" onSubmit={submit}><label>Name<input name="name" required autoComplete="off" defaultValue={impactRequest?.name ?? selected?.name} readOnly={Boolean(selected)} /></label><label>Azure account<input name="azure_account" required autoComplete="off" defaultValue={impactRequest?.azure_account ?? selected?.azure_account} /></label><label>Authentication<select name="auth_mode" value={formAuthMode} onChange={event => setFormAuthMode(event.target.value as Schema['BackendAuthMode'])}>{modes.map(mode => <option key={mode} value={mode}>{authLabels[mode]}</option>)}</select></label>{formAuthMode === 'managed_identity' ? <><label>Managed Identity client ID<input name="managed_identity_client_id" type="text" autoComplete="off" defaultValue={impactRequest?.managed_identity_client_id ?? selected?.managed_identity_client_id ?? ''} placeholder="System / workload identity" /></label><label className="checkbox-field"><input name="user_delegation_sas_enabled" type="checkbox" defaultChecked={impactRequest?.user_delegation_sas_enabled ?? selected?.user_delegation_sas_enabled ?? true} /> User Delegation SAS enabled</label></> : <label>Secret reference<input name="secret_ref" type="password" required autoComplete="off" defaultValue={impactRequest?.secret_ref ?? ''} /></label>}<label>Region label<input name="region_label" autoComplete="off" defaultValue={impactRequest?.region_label ?? selected?.region_label ?? ''} /></label><label className="checkbox-field"><input name="enabled" type="checkbox" defaultChecked={impactRequest?.enabled ?? selected?.enabled ?? true} /> Enabled</label>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button type="button" disabled={pending} onClick={dismiss}>Cancel</button><button className="primary" disabled={pending}>{pending ? 'Saving...' : 'Review and save'}</button></div></form></Modal>}
    {reviewingImpact && impactRequest && selected && <Modal title="Confirm routing impact" description={`This change can affect ${references(selected)}. References are rechecked by the server when required.`} onClose={dismiss} pending={pending}><p className="confirmation-name">{selected.name}</p>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button disabled={pending} onClick={() => { setReviewingImpact(false); setError(null) }}>Back</button><button className="primary" disabled={pending} onClick={() => { void persist(impactRequest, selected) }}>{pending ? 'Saving...' : 'Confirm change'}</button></div></Modal>}
      {action?.kind === 'delete' && <DestructiveDialog title="Delete backend" description={`Deletion is blocked while this backend has ${references(action.backend)}.`} confirmLabel={`Delete ${action.backend.name}`} pending={pending} onClose={dismiss} onConfirm={() => { void remove() }}><p className="confirmation-name">{action.backend.name}</p>{error && <ErrorBanner error={error} />}</DestructiveDialog>}
    {action?.kind === 'detail' && <Modal title="Backend details" description={action.backend.name} onClose={dismiss} pending={pending}><BackendDetails backend={action.backend} /><div className="dialog-actions"><button onClick={dismiss}>Close</button></div></Modal>}
    {reviewRequired && <Modal title="Backend changed" description="Reload the current backend before reviewing another update." onClose={dismiss} pending={pending}>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button disabled={pending} onClick={dismiss}>Cancel</button><button className="primary" disabled={pending} onClick={() => { void reloadForReview() }}>{pending ? 'Loading...' : 'Reload backend'}</button></div></Modal>}
  </Page>
}