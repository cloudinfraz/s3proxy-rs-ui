import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { invalidateControl } from '../../api/query-keys'
import { DataTable, ErrorBanner, Modal, Page, RefreshButton } from '../../components/control'
import { completionGuard } from '../operations/state'
import { backendPayload, requiresImpactConfirmation } from './payloads'

type Backend = Schema['StorageBackendProjection']
type BackendRequest = Schema['StorageBackendRequest']
type Action = { backend: Backend; kind: 'edit' | 'delete' }

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
  const [formAuthMode, setFormAuthMode] = useState<Schema['BackendAuthMode']>('managed_identity')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])

  function dismiss() {
    guard.current.cancel()
    setCreating(false)
    setAction(null)
    setImpactRequest(null)
    setFormAuthMode('managed_identity')
    setPending(false)
    setError(null)
  }

  function report(cause: unknown, operation: string, request: number) {
    if (!guard.current.current(request)) return
    const detail = cause instanceof ApiError ? cause.message : operation
    setError(new Error(`${operation} failed${cause instanceof ApiError ? ` (HTTP ${cause.status}): ${detail}` : ''}`))
  }

  async function persist(payload: BackendRequest, existing?: Backend) {
    const request = guard.current.begin()
    setPending(true)
    setError(null)
    try {
      if (existing && impactRequest) {
        const current = await api<Backend>(`/admin/ui/backends/${encodeURIComponent(existing.name)}`)
        if (current.credential_default_count !== existing.credential_default_count
          || current.virtual_bucket_count !== existing.virtual_bucket_count) {
          if (guard.current.current(request)) {
            setAction({ backend: current, kind: 'edit' })
            setImpactRequest(null)
            setError(new Error('Backend references changed. Review the updated impact before saving.'))
          }
          return
        }
      }
      await api<Schema['StorageBackendResponse']>(existing
        ? `/admin/ui/backends/${encodeURIComponent(existing.name)}`
        : '/admin/ui/backends', {
        method: existing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      await invalidateControl(queryClient)
      if (guard.current.current(request)) dismiss()
    } catch (cause) { report(cause, existing ? 'Backend update' : 'Backend creation', request) }
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
  const selected = action?.kind === 'edit' ? action.backend : null
  const references = (backend: Backend) => `${backend.credential_default_count} identities / ${backend.virtual_bucket_count} mappings`

  return <Page title="Azure backends" subtitle="Managed Identity routing registrations and their control-plane references" action={<div className="page-actions"><RefreshButton pending={backends.isFetching} refresh={() => { void backends.refetch() }} /><button className="primary" disabled={!capabilities.data?.backend_routing_enabled || modes.length === 0} onClick={() => { dismiss(); setFormAuthMode(modes[0]); setCreating(true) }}><Plus size={17} /> Register backend</button></div>}>
    {backends.isError && <ErrorBanner error={backends.error} retry={() => { void backends.refetch() }} />}
    {capabilities.isError && <ErrorBanner error={capabilities.error} retry={() => { void capabilities.refetch() }} />}
    {capabilities.data && !capabilities.data.backend_routing_enabled && <p className="empty-state">Backend routing is disabled for this deployment.</p>}
    {(!backends.isError || backends.data) && <DataTable rows={backends.data ?? []} rowKey={backend => backend.id} loading={backends.isPending} columns={[
      { label: 'Name', value: backend => backend.name },
      { label: 'Azure account', value: backend => backend.azure_account },
      { label: 'Authentication', value: backend => authLabels[backend.auth_mode] },
      { label: 'Identity', value: backend => backend.managed_identity_client_id ?? 'System / workload identity' },
      { label: 'Status', value: backend => backend.enabled ? 'Enabled' : 'Disabled' },
      { label: 'References', value: references },
      { label: 'Actions', value: backend => <div className="row-actions"><button className="icon-button" title={modes.includes(backend.auth_mode) ? 'Edit backend' : 'Authentication mode is unavailable'} aria-label={`Edit ${backend.name}`} disabled={!modes.includes(backend.auth_mode)} onClick={() => { dismiss(); setFormAuthMode(backend.auth_mode); setAction({ backend, kind: 'edit' }) }}><Pencil size={16} /></button><button className="icon-button danger" title="Delete backend" aria-label={`Delete ${backend.name}`} onClick={() => { dismiss(); setAction({ backend, kind: 'delete' }) }}><Trash2 size={16} /></button></div> },
    ]} />}
    {(creating || selected) && !impactRequest && <Modal title={selected ? 'Edit backend' : 'Register backend'} description="Stores routing metadata only and does not probe or modify Azure storage." onClose={dismiss}><form className="operation-form" onSubmit={submit}><label>Name<input name="name" required autoComplete="off" defaultValue={selected?.name} readOnly={Boolean(selected)} /></label><label>Azure account<input name="azure_account" required autoComplete="off" defaultValue={selected?.azure_account} /></label><label>Authentication<select name="auth_mode" value={formAuthMode} onChange={event => setFormAuthMode(event.target.value as Schema['BackendAuthMode'])}>{modes.map(mode => <option key={mode} value={mode}>{authLabels[mode]}</option>)}</select></label>{formAuthMode === 'managed_identity' ? <><label>Managed Identity client ID<input name="managed_identity_client_id" type="text" autoComplete="off" defaultValue={selected?.managed_identity_client_id ?? ''} placeholder="System / workload identity" /></label><label className="checkbox-field"><input name="user_delegation_sas_enabled" type="checkbox" defaultChecked={selected?.user_delegation_sas_enabled ?? true} /> User Delegation SAS enabled</label></> : <label>Secret reference<input name="secret_ref" type="password" required autoComplete="off" /></label>}<label>Region label<input name="region_label" autoComplete="off" defaultValue={selected?.region_label ?? ''} /></label><label className="checkbox-field"><input name="enabled" type="checkbox" defaultChecked={selected?.enabled ?? true} /> Enabled</label>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button type="button" onClick={dismiss}>Cancel</button><button className="primary" disabled={pending}>{pending ? 'Saving...' : 'Review and save'}</button></div></form></Modal>}
    {impactRequest && selected && <Modal title="Confirm routing impact" description={`This change can affect ${references(selected)}. References are rechecked by the server when required.`} onClose={() => { setImpactRequest(null); setError(null) }}><p className="confirmation-name">{selected.name}</p>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button onClick={() => { setImpactRequest(null); setError(null) }}>Back</button><button className="primary" disabled={pending} onClick={() => { void persist(impactRequest, selected) }}>{pending ? 'Saving...' : 'Confirm change'}</button></div></Modal>}
    {action?.kind === 'delete' && <Modal title="Delete backend" description={`Deletion is blocked while this backend has ${references(action.backend)}.`} onClose={dismiss}><p className="confirmation-name">{action.backend.name}</p>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button onClick={dismiss}>Cancel</button><button className="primary" disabled={pending} onClick={() => { void remove() }}>{pending ? 'Deleting...' : 'Delete'}</button></div></Modal>}
  </Page>
}