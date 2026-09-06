import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { Eye, KeyRound, Pencil, Plus, RotateCw, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { invalidateControl } from '../../api/query-keys'
import { DataTable, ErrorBanner, Modal, Page, RefreshButton } from '../../components/control'
import { EphemeralCredentials, type EphemeralCredentialMaterial } from '../../components/EphemeralCredentials'
import { completionGuard } from '../operations/state'
import { createIdentityPayload, replacementIdentityPayload, updateIdentityPayload } from './payloads'
import { createDirectMappingPayload, directMappingRemovalDescription, directMappingRows, updateDirectMappingPayload } from './direct-mappings'
import './identities.css'
import DirectMappingDetails from './DirectMappingDetails'

type Identity = Schema['IdentityProjection']
type Action = { identity: Identity; kind: 'edit' | 'replace' | 'rotate' | 'delete' }

export default function IdentitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const directMappingsOnly = searchParams.get('mode') === 'direct'
  const identities = useQuery(controlQueries.identities)
  const backends = useQuery(controlQueries.backends)
  const capabilities = useQuery(controlQueries.capabilities)
  const [detailsKey, setDetailsKey] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [oneTime, setOneTime] = useState<EphemeralCredentialMaterial | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])

  function dismiss() {
    guard.current.cancel()
    setDetailsKey(null)
    setCreating(false)
    setAction(null)
    setOneTime(null)
    setPending(false)
    setError(null)
  }

  function begin() {
    const request = guard.current.begin()
    setPending(true)
    setError(null)
    return request
  }

  function report(cause: unknown, operation: string, request: number) {
    if (!guard.current.current(request)) return
    setError(new Error(cause instanceof ApiError ? `${operation} failed (HTTP ${cause.status})` : `${operation} failed`))
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const request = begin()
    try {
      const result = await api<Schema['CredentialCreatedResponse']>('/admin/credentials', {
        method: 'POST',
        body: JSON.stringify((directMappingsOnly ? createDirectMappingPayload : createIdentityPayload)({
          azureAccount: String(form.get('azure_account')),
          accessMode: String(form.get('access_mode')) as Schema['CredentialAccessMode'],
          versioningEnabled: form.get('versioning_enabled') === 'on',
          defaultBackendId: String(form.get('default_backend_id') ?? ''),
        })),
      })
      void invalidateControl(queryClient)
      if (!guard.current.current(request)) return
      setCreating(false)
      setOneTime({ accessKey: result.s3_access_key, secretKey: result.s3_secret_key, endpoint: result.s3_endpoint })
    } catch (cause) { report(cause, 'Identity creation', request) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  async function confirm(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!action || pending) return
    const request = begin()
    try {
      if (action.kind === 'edit') {
        const form = new FormData(event?.currentTarget)
        const input = {
          identity: action.identity,
          azureAccount: String(form.get('azure_account') ?? action.identity.azure_account),
          enabled: form.get('enabled') === 'on',
          versioningEnabled: form.get('versioning_enabled') === 'on',
          defaultBackendId: String(form.get('default_backend_id') ?? ''),
        }
        await api(`/admin/credentials/${encodeURIComponent(action.identity.s3_access_key)}`, {
          method: 'PUT',
          body: JSON.stringify(directMappingsOnly ? updateDirectMappingPayload(input) : updateIdentityPayload(input)),
        })
      } else if (action.kind === 'delete') {
        await api(`/admin/credentials/${encodeURIComponent(action.identity.s3_access_key)}`, { method: 'DELETE' })
      } else if (action.kind === 'rotate') {
        if (!action.identity.credential_id) throw new Error('Identity has no stable identifier')
        const result = await api<Schema['RotateCredentialSecretResponse']>(`/admin/credentials/${encodeURIComponent(action.identity.credential_id)}/rotate-secret`, { method: 'POST' })
        if (!guard.current.current(request)) return
        setAction(null)
        setOneTime({ accessKey: result.s3_access_key, secretKey: result.s3_secret_key })
      } else {
        const result = await api<Schema['CredentialCreatedResponse']>('/admin/credentials', { method: 'POST', body: JSON.stringify(replacementIdentityPayload(action.identity)) })
        if (!guard.current.current(request)) return
        setAction(null)
        setOneTime({ accessKey: result.s3_access_key, secretKey: result.s3_secret_key, endpoint: result.s3_endpoint })
      }
      void invalidateControl(queryClient)
      if (guard.current.current(request) && action.kind !== 'rotate' && action.kind !== 'replace') dismiss()
    } catch (cause) { report(cause, action.kind === 'rotate' ? 'Secret rotation' : action.kind === 'replace' ? 'Identity replacement' : 'Identity update', request) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  const enabledBackends = (backends.data ?? []).filter(backend => backend.enabled)
  const counts = (identity: Identity) => identity.virtual_bucket_count === null || identity.policy_attachment_count === null
    ? 'Unavailable'
    : `${identity.virtual_bucket_count} routes / ${identity.policy_attachment_count} policies`

  return <Page title={directMappingsOnly ? 'Direct mappings' : 'S3 identities'} subtitle={directMappingsOnly ? 'S3 identities and Azure account routes' : 'Signing identities and their control-plane dependencies'} action={<div className="page-actions"><RefreshButton pending={identities.isFetching} refresh={() => { void identities.refetch() }} /><button className="primary" onClick={() => { dismiss(); setCreating(true) }}><Plus size={17} /> {directMappingsOnly ? 'Add direct mapping' : 'Create identity'}</button></div>}>
    <label className="identity-view-filter">View<select value={directMappingsOnly ? 'direct' : 'all'} onChange={event => { dismiss(); setSearchParams(event.target.value === 'direct' ? { mode: 'direct' } : {}) }}><option value="all">All identities</option><option value="direct">Direct mappings</option></select></label>
    {identities.isError && <ErrorBanner error={identities.error} retry={() => { void identities.refetch() }} />}
    {(!identities.isError || identities.data) && <DataTable rows={directMappingsOnly ? directMappingRows(identities.data ?? []) : identities.data ?? []} rowKey={identity => identity.credential_id ?? identity.s3_access_key} loading={identities.isPending} columns={[
      { label: 'Access key', value: identity => <code>{identity.s3_access_key}</code> },
      { label: 'Mode', value: identity => identity.access_mode },
      { label: 'Azure account', value: identity => identity.azure_account },
      { label: 'Status', value: identity => identity.enabled === null ? 'Unavailable' : identity.enabled ? 'Enabled' : 'Disabled' },
      { label: 'Dependencies', value: counts },
      { label: 'Actions', value: identity => <div className="row-actions">{directMappingsOnly && <button className="icon-button" title="View direct mapping details" aria-label={`View ${identity.s3_access_key}`} onClick={() => { dismiss(); setDetailsKey(identity.credential_id ?? identity.s3_access_key) }}><Eye size={16} /></button>}<button className="icon-button" title={directMappingsOnly ? 'Configure mapping' : 'Edit identity'} aria-label={`Edit ${identity.s3_access_key}`} onClick={() => { dismiss(); setAction({ identity, kind: 'edit' }) }}><Pencil size={16} /></button>{!directMappingsOnly && <><button className="icon-button" title="Rotate secret" aria-label={`Rotate ${identity.s3_access_key}`} disabled={!identity.credential_id} onClick={() => { dismiss(); setAction({ identity, kind: 'rotate' }) }}><RotateCw size={16} /></button><button className="icon-button" title="Create replacement" aria-label={`Replace ${identity.s3_access_key}`} onClick={() => { dismiss(); setAction({ identity, kind: 'replace' }) }}><KeyRound size={16} /></button></>}<button className="icon-button danger" title={directMappingsOnly ? 'Remove mapping' : 'Delete identity'} aria-label={`Delete ${identity.s3_access_key}`} onClick={() => { dismiss(); setAction({ identity, kind: 'delete' }) }}><Trash2 size={16} /></button></div> },
    ]} />}
    {creating && <Modal title={directMappingsOnly ? 'Add direct mapping' : 'Create S3 identity'} description="Creates metadata only and uses Managed Identity for Azure access." onClose={dismiss}><form className="operation-form" onSubmit={create}><label>Azure account<input name="azure_account" required autoComplete="off" /></label>{directMappingsOnly ? <input type="hidden" name="access_mode" value="direct" /> : <label>Mode<select name="access_mode" defaultValue="direct"><option value="direct">Direct</option><option value="virtual">Virtual</option></select></label>}<label>Default backend<select name="default_backend_id" defaultValue=""><option value="">Legacy account route</option>{enabledBackends.map(backend => <option key={backend.id} value={backend.id}>{backend.name}</option>)}</select></label><label className="checkbox-field"><input name="versioning_enabled" type="checkbox" /> Versioning enabled</label>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button type="button" onClick={dismiss}>Cancel</button><button className="primary" disabled={pending}>{pending ? 'Creating...' : directMappingsOnly ? 'Add mapping' : 'Create identity'}</button></div></form></Modal>}
    {action?.kind === 'edit' && <Modal title={directMappingsOnly ? 'Configure direct mapping' : 'Edit identity'} description="Access key, mode and secret are not changed by this form." onClose={dismiss}><form className="operation-form" onSubmit={confirm}>{directMappingsOnly && <label>Azure account<input name="azure_account" required pattern="[a-z0-9]{3,24}" readOnly={!action.identity.use_managed_identity} defaultValue={action.identity.azure_account} /></label>}<label>Default backend<select name="default_backend_id" defaultValue={action.identity.default_backend_id ?? ''}><option value="">Keep current selection</option>{enabledBackends.map(backend => <option key={backend.id} value={backend.id}>{backend.name}</option>)}</select></label><label className="checkbox-field"><input name="enabled" type="checkbox" defaultChecked={action.identity.enabled ?? true} /> Enabled</label><label className="checkbox-field"><input name="versioning_enabled" type="checkbox" defaultChecked={action.identity.versioning_enabled} /> Versioning enabled</label>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button type="button" onClick={dismiss}>Cancel</button><button className="primary" disabled={pending}>{pending ? 'Saving...' : 'Save'}</button></div></form></Modal>}
    {action && action.kind !== 'edit' && <Modal title={action.kind === 'rotate' ? 'Rotate secret' : action.kind === 'replace' ? 'Create replacement' : directMappingsOnly ? 'Remove direct mapping' : 'Delete identity'} description={action.kind === 'delete' ? directMappingsOnly ? directMappingRemovalDescription(action.identity) : `Revokes this identity and removes ${counts(action.identity)}. Azure containers and blobs are retained.` : action.kind === 'replace' ? 'Creates a new identity with safe settings only. Existing mappings and policies are not copied, and the original remains active.' : 'Immediately invalidates the current secret and parent-revision temporary credentials.'} onClose={dismiss}><p className="confirmation-name">{action.identity.s3_access_key}</p>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button onClick={dismiss}>Cancel</button><button className="primary" disabled={pending} onClick={() => { void confirm() }}>{pending ? 'Applying...' : directMappingsOnly ? 'Remove mapping' : 'Confirm'}</button></div></Modal>}
    {detailsKey && directMappingsOnly && <DirectMappingDetails
      identity={identities.isError ? undefined : identities.data?.find(identity => (identity.credential_id ?? identity.s3_access_key) === detailsKey)}
      backends={backends.isError ? undefined : backends.data}
      capabilities={capabilities.isError ? undefined : capabilities.data}
      onClose={dismiss}
    />}
    {oneTime && <EphemeralCredentials material={oneTime} dismiss={dismiss} />}
  </Page>
}
