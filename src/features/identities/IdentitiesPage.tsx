import { useEffect, useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, Eye, KeyRound, Pencil, Plus, RotateCw, Trash2 } from 'lucide-react'
import { ApiError, isIndeterminateMutationError } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { invokeOperation } from '../../api/operations'
import { invalidateControl } from '../../api/query-keys'
import { DataTable, DestructiveDialog, ErrorBanner, Modal, Page, RefreshButton } from '../../components/control'
import { EphemeralCredentials, type EphemeralCredentialMaterial } from '../../components/EphemeralCredentials'
import { BackendSelectorPagination, useBackendSelectorPage } from '../backends/backend-selector'
import { completionGuard } from '../operations/state'
import { batchOperationLimit, runBoundedBatch } from '../operations/batch'
import { createIdentityPayload, identityBackendOptions, replacementIdentityDraft, updateIdentityPayload } from './payloads'
import { createDirectMappingPayload, directMappingRemovalDescription, directMappingRows, updateDirectMappingPayload } from './direct-mappings'
import { isNonBlank, isValidCredentialId, mappingCreationPath, requestsVirtualIdentity } from './credential-mapping-workflow'
import './identities.css'
import DirectMappingDetails from './DirectMappingDetails'

type Identity = Schema['IdentityProjection']
type Action = { identity: Identity; kind: 'edit' | 'replace' | 'rotate' | 'delete' }
type CreatedCredentialMaterial = EphemeralCredentialMaterial & { credentialId: string; accessMode: Schema['CredentialAccessMode'] }

export default function IdentitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const directMappingsOnly = searchParams.get('mode') === 'direct'
  const readinessIdentityId = searchParams.get('finding') === 'identity_no_enabled_mapping' ? searchParams.get('credential_id') : null
  const virtualMappingWorkflow = useRef(requestsVirtualIdentity(searchParams))
  const [identityCursors, setIdentityCursors] = useState<Array<string | null>>([null])
  const identityCursor = identityCursors[identityCursors.length - 1]
  const identityPage = useQuery(controlQueries.identityPage(identityCursor, directMappingsOnly ? 'direct' : null))
  const identities = { ...identityPage, data: identityPage.data?.items }
  const readinessIdentityFromPage = identities.data?.find(identity => identity.credential_id === readinessIdentityId)
  const readinessIdentity = useQuery({ ...controlQueries.identity(readinessIdentityId ?? ''), enabled: Boolean(readinessIdentityId && !readinessIdentityFromPage) })
  const backendSelector = useBackendSelectorPage()
  const capabilities = useQuery(controlQueries.capabilities)
  const [detailsKey, setDetailsKey] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [selectedBackendId, setSelectedBackendId] = useState('')
  const backendFromPage = backendSelector.query.data?.items.find(backend => backend.id === selectedBackendId)
  const selectedBackend = useQuery({ ...controlQueries.backendOption(selectedBackendId), enabled: Boolean(selectedBackendId && !backendFromPage) })
  const [oneTime, setOneTime] = useState<CreatedCredentialMaterial | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [indeterminate, setIndeterminate] = useState<'create' | 'rotate' | null>(null)
  const [cleanupSelection, setCleanupSelection] = useState<Set<string>>(() => new Set())
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)
  const [cleanupFailures, setCleanupFailures] = useState<readonly string[]>([])
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])
  useEffect(() => {
    if (!virtualMappingWorkflow.current) return
    setCreating(true)
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  function dismiss() {
    guard.current.cancel()
    virtualMappingWorkflow.current = false
    setDetailsKey(null)
    setCreating(false)
    setAction(null)
    setSelectedBackendId('')
    setOneTime(null)
    setPending(false)
    setError(null)
    setIndeterminate(null)
  }

  function begin() {
    const request = guard.current.begin()
    setPending(true)
    setError(null)
    setIndeterminate(null)
    return request
  }

  function report(cause: unknown, operation: string, request: number, recovery?: 'create' | 'rotate') {
    if (!guard.current.current(request)) return
    if (recovery && isIndeterminateMutationError(cause)) {
      setIndeterminate(recovery)
      setError(new Error(recovery === 'rotate'
        ? 'Secret rotation may have completed, so the previous secret may no longer work. Rotate again to issue another secret for the same access key.'
        : 'Identity creation may have completed, but its one-time credentials were not received. Refresh the identity list and remove any unusable identity before creating another.'))
      if (recovery === 'create') void invalidateControl(queryClient)
      return
    }
    setError(new Error(cause instanceof ApiError ? `${operation} failed (HTTP ${cause.status})` : `${operation} failed`))
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const backendId = selectedBackendId
    if (backendId && !backendOptions.some(backend => backend.id === backendId && !backend.disabled)) {
      setError(new Error('Select an enabled backend or the legacy account route.'))
      return
    }
    const request = begin()
    try {
      const result = await invokeOperation('createCredential', {
        body: (directMappingsOnly ? createDirectMappingPayload : createIdentityPayload)({
          azureAccount: String(form.get('azure_account')),
          accessMode: String(form.get('access_mode')) as Schema['CredentialAccessMode'],
          versioningEnabled: form.get('versioning_enabled') === 'on',
          defaultBackendId: backendId,
        }),
      })
      if (!guard.current.current(request)) return
      if (!isNonBlank(result.s3_access_key) || !isNonBlank(result.s3_secret_key)) throw new Error('The server did not return one-time credentials')
      if (virtualMappingWorkflow.current && (result.access_mode !== 'virtual' || !isValidCredentialId(result.credential_id))) throw new Error('The server did not return a virtual identity for bucket routing')
      const refreshBeforeHandoff = virtualMappingWorkflow.current
      setCreating(false)
      setAction(null)
      setOneTime({ credentialId: result.credential_id, accessMode: result.access_mode, accessKey: result.s3_access_key, secretKey: result.s3_secret_key, endpoint: result.s3_endpoint })
      if (refreshBeforeHandoff) await invalidateControl(queryClient)
      else void invalidateControl(queryClient)
    } catch (cause) { report(cause, 'Identity creation', request, 'create') }
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
          enabled: action.identity.enabled === null ? null : form.get('enabled') === 'on',
          versioningEnabled: form.get('versioning_enabled') === 'on',
          defaultBackendId: backendOptions.some(backend => backend.id === selectedBackendId && !backend.disabled) ? selectedBackendId : '',
        }
        await invokeOperation('updateCredential', {
          parameters: { path: { access_key: action.identity.s3_access_key } },
          body: directMappingsOnly ? updateDirectMappingPayload(input) : updateIdentityPayload(input),
        })
      } else if (action.kind === 'delete') {
        await invokeOperation('deleteCredential', { parameters: { path: { access_key: action.identity.s3_access_key } } })
      } else if (action.kind === 'rotate') {
        if (!action.identity.credential_id) throw new Error('Identity has no stable identifier')
        const result = await invokeOperation('rotateCredentialSecret', { parameters: { path: { credential_id: action.identity.credential_id } } })
        if (!guard.current.current(request)) return
        if (result.credential_id !== action.identity.credential_id || result.s3_access_key !== action.identity.s3_access_key || !isNonBlank(result.s3_secret_key)) throw new Error('The server returned invalid rotated credentials')
        setAction(null)
        setOneTime({ credentialId: result.credential_id, accessMode: action.identity.access_mode, accessKey: result.s3_access_key, secretKey: result.s3_secret_key })
      }
      void invalidateControl(queryClient)
      if (guard.current.current(request) && action.kind !== 'rotate' && action.kind !== 'replace') dismiss()
    } catch (cause) { report(cause, action.kind === 'rotate' ? 'Secret rotation' : action.kind === 'replace' ? 'Identity replacement' : 'Identity update', request, action.kind === 'rotate' ? 'rotate' : undefined) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  const draft = action?.kind === 'replace' ? replacementIdentityDraft(action.identity) : undefined
  const backendOptionItems = [...(backendSelector.query.data?.items ?? []), ...(selectedBackend.data ? [selectedBackend.data] : [])]
    .filter((backend, index, items) => items.findIndex(candidate => candidate.id === backend.id) === index)
  const backendOptions = identityBackendOptions(backendSelector.query.isError || selectedBackend.isError ? undefined : backendOptionItems, selectedBackendId)
  const selectedIdentity = identities.isError ? undefined : identities.data?.find(identity => (identity.credential_id ?? identity.s3_access_key) === detailsKey)
  const cleanupItems = [...(identities.data ?? []), ...(readinessIdentity.data && !readinessIdentityFromPage ? [readinessIdentity.data] : [])]
  const cleanupCandidates = cleanupItems.filter((identity, index, items) => identity.access_mode === 'virtual' && (identity.virtual_bucket_count === 0 || identity.credential_id === readinessIdentityId) && items.findIndex(candidate => candidate.credential_id === identity.credential_id) === index)
  const selectedCleanup = cleanupCandidates.filter(identity => cleanupSelection.has(identity.s3_access_key))
  const counts = (identity: Identity) => identity.virtual_bucket_count === null || identity.policy_attachment_count === null
    ? 'Unavailable'
    : `${identity.virtual_bucket_count} routes / ${identity.policy_attachment_count} policies`

  function acknowledgeCredentials() {
    if (!oneTime) return
    const destination = virtualMappingWorkflow.current && oneTime.accessMode === 'virtual'
      ? mappingCreationPath(oneTime.credentialId)
      : null
    flushSync(dismiss)
    if (destination) navigate(destination)
  }

  function toggleCleanup(accessKey: string) {
    setCleanupResult(null)
    setCleanupFailures([])
    setCleanupSelection(current => {
      const next = new Set(current)
      if (next.has(accessKey)) next.delete(accessKey)
      else if (next.size < batchOperationLimit) next.add(accessKey)
      return next
    })
  }

  async function cleanupIdentities() {
    if (pending || selectedCleanup.length === 0) return
    const request = begin()
    const targets = [...selectedCleanup]
    try {
      const result = await runBoundedBatch(targets, async identity => {
        try {
          await invokeOperation('deleteCredential', { parameters: { path: { access_key: identity.s3_access_key } } })
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 404) return
          throw cause
        }
      })
      if (!guard.current.current(request)) return
      setCleanupOpen(false)
      setCleanupSelection(new Set(result.failed.map(item => item.key.s3_access_key).concat(result.indeterminate.map(item => item.key.s3_access_key))))
      setCleanupResult(`${result.succeeded.length} deleted, ${result.failed.length} failed, ${result.indeterminate.length} need verification.`)
      setCleanupFailures([
        ...result.failed.map(item => `${item.key.s3_access_key}: deletion failed`),
        ...result.indeterminate.map(item => `${item.key.s3_access_key}: deletion outcome needs verification`),
      ])
      await invalidateControl(queryClient)
    } finally {
      if (guard.current.current(request)) setPending(false)
    }
  }

  return <Page title={directMappingsOnly ? 'Direct mappings' : 'S3 identities'} subtitle={directMappingsOnly ? 'S3 identities and Azure account routes' : 'Signing identities and their control-plane dependencies'} action={<div className="page-actions"><RefreshButton pending={identities.isFetching} refresh={() => { void identities.refetch() }} /><button className="primary" onClick={() => { dismiss(); setCreating(true) }}><Plus size={17} /> {directMappingsOnly ? 'Add direct mapping' : 'Create identity'}</button></div>}>
    <label className="identity-view-filter">View<select value={directMappingsOnly ? 'direct' : 'all'} onChange={event => { dismiss(); setCleanupSelection(new Set()); setIdentityCursors([null]); setSearchParams(event.target.value === 'direct' ? { mode: 'direct' } : {}) }}><option value="all">All identities</option><option value="direct">Direct mappings</option></select></label>
    {!directMappingsOnly && cleanupCandidates.length > 0 && <section className="identity-cleanup" aria-label="Obsolete identity cleanup"><div><strong>Cleanup candidates</strong><p>Virtual identities with no mappings, plus the identity selected from configuration readiness. Deletion also removes any mappings and policy attachments shown below; other dependencies may block deletion.</p>{readinessIdentity.data && !readinessIdentityFromPage && <p>Readiness candidate: <code>{readinessIdentity.data.s3_access_key}</code></p>}</div><div className="page-actions"><button type="button" onClick={() => { setCleanupFailures([]); setCleanupSelection(new Set(cleanupCandidates.slice(0, batchOperationLimit).map(identity => identity.s3_access_key))) }}>Select listed candidates</button><button type="button" className="danger" disabled={selectedCleanup.length === 0 || pending} onClick={() => setCleanupOpen(true)}>Delete selected ({selectedCleanup.length})</button></div></section>}
    {readinessIdentity.isError && <ErrorBanner error={new Error('The identity referenced by configuration readiness is no longer available.')} retry={() => { void readinessIdentity.refetch() }} />}
    {cleanupResult && <div className="identity-cleanup-result" role="status"><p>{cleanupResult}</p>{cleanupFailures.length > 0 && <ul>{cleanupFailures.map(item => <li key={item}>{item}</li>)}</ul>}</div>}
    {identities.isError && <ErrorBanner error={identities.error} retry={() => { void identities.refetch() }} />}
    {(!identities.isError || identities.data) && <DataTable rows={directMappingsOnly ? directMappingRows(identities.data ?? []) : identities.data ?? []} rowKey={identity => identity.credential_id ?? identity.s3_access_key} loading={identities.isPending} columns={[
      ...(!directMappingsOnly && cleanupCandidates.length > 0 ? [{ label: 'Select', value: (identity: Identity) => cleanupCandidates.some(candidate => candidate.s3_access_key === identity.s3_access_key) ? <input type="checkbox" aria-label={`Select ${identity.s3_access_key} for cleanup`} checked={cleanupSelection.has(identity.s3_access_key)} onChange={() => toggleCleanup(identity.s3_access_key)} /> : null }] : []),
      { label: 'Access key', value: identity => <code>{identity.s3_access_key}</code> },
      { label: 'Mode', value: identity => identity.access_mode },
      { label: 'Azure account', value: identity => identity.azure_account },
      { label: 'Status', value: identity => identity.enabled === null ? 'Unavailable' : identity.enabled ? 'Enabled' : 'Disabled' },
      { label: 'Dependencies', value: counts },
      { label: 'Actions', value: identity => <div className="row-actions"><button className="icon-button" title={directMappingsOnly ? 'View direct mapping details' : 'View identity details'} aria-label={`View ${identity.s3_access_key}`} onClick={() => { dismiss(); setSelectedBackendId(identity.default_backend_id ?? ''); setDetailsKey(identity.credential_id ?? identity.s3_access_key) }}><Eye size={16} /></button><button className="icon-button" title={directMappingsOnly ? 'Configure mapping' : 'Edit identity'} aria-label={`Edit ${identity.s3_access_key}`} onClick={() => { dismiss(); setSelectedBackendId(identity.default_backend_id ?? ''); setAction({ identity, kind: 'edit' }) }}><Pencil size={16} /></button>{!directMappingsOnly && <><button className="icon-button" title="Rotate secret" aria-label={`Rotate ${identity.s3_access_key}`} disabled={!identity.credential_id} onClick={() => { dismiss(); setAction({ identity, kind: 'rotate' }) }}><RotateCw size={16} /></button><button className="icon-button" title="Create replacement" aria-label={`Replace ${identity.s3_access_key}`} onClick={() => { dismiss(); setSelectedBackendId(identity.default_backend_id ?? ''); setAction({ identity, kind: 'replace' }) }}><KeyRound size={16} /></button></>}<button className="icon-button danger" title={directMappingsOnly ? 'Remove mapping' : 'Delete identity'} aria-label={`Delete ${identity.s3_access_key}`} onClick={() => { dismiss(); setAction({ identity, kind: 'delete' }) }}><Trash2 size={16} /></button></div> },
    ]} />}
    <div className="identity-pagination" aria-label="S3 identity pagination"><button className="icon-button" aria-label="Previous identity page" title="Previous page" disabled={identityCursors.length === 1 || identities.isFetching} onClick={() => { dismiss(); setCleanupSelection(new Set()); setIdentityCursors(value => value.slice(0, -1)) }}><ChevronLeft size={16} /></button><span>Page {identityCursors.length}</span><button className="icon-button" aria-label="Next identity page" title="Next page" disabled={!identityPage.data?.next_after_id || identities.isFetching} onClick={() => { if (identityPage.data?.next_after_id) { dismiss(); setCleanupSelection(new Set()); setIdentityCursors(value => [...value, identityPage.data!.next_after_id]) } }}><ChevronRight size={16} /></button></div>
    {cleanupOpen && <DestructiveDialog title="Delete obsolete identities" description="Deletes each selected identity through the existing audited operation. Completed deletions are not rolled back if a later item fails." confirmLabel={`Delete ${selectedCleanup.length} identities`} pending={pending} onClose={() => setCleanupOpen(false)} onConfirm={() => { void cleanupIdentities() }}><ul className="cleanup-impact">{selectedCleanup.map(identity => <li key={identity.s3_access_key}><code>{identity.s3_access_key}</code>: {identity.virtual_bucket_count} mappings, {identity.policy_attachment_count} policy attachments</li>)}</ul></DestructiveDialog>}
    {(creating || draft) && <Modal title={draft ? 'Create replacement' : directMappingsOnly ? 'Add direct mapping' : 'Create S3 identity'} description={draft ? 'Creates new credentials from reviewed settings. Mappings and policies are not copied; the original identity is unchanged.' : virtualMappingWorkflow.current ? 'Creates server-generated S3 credentials for a new virtual bucket mapping.' : 'Creates metadata only and uses Managed Identity for Azure access.'} onClose={dismiss} pending={pending}><form className="operation-form" onSubmit={create}><label>Azure account<input name="azure_account" required pattern="[a-z0-9]{3,24}" autoComplete="off" defaultValue={draft?.azureAccount ?? ''} /></label>{directMappingsOnly ? <input type="hidden" name="access_mode" value="direct" /> : virtualMappingWorkflow.current ? <label>Mode<input name="access_mode" value="virtual" readOnly /></label> : <div><label htmlFor="identity-create-mode">Mode</label><select id="identity-create-mode" name="access_mode" defaultValue={draft?.accessMode ?? 'direct'}><option value="direct">Direct</option><option value="virtual">Virtual</option></select></div>}<label>Default backend<select name="default_backend_id" value={selectedBackendId} onChange={event => setSelectedBackendId(event.target.value)}><option value="">Legacy account route</option>{backendOptions.map(backend => <option key={backend.id} value={backend.id} disabled={backend.disabled}>{backend.label}</option>)}</select></label><BackendSelectorPagination page={backendSelector.page} pending={backendSelector.query.isFetching} canPrevious={backendSelector.canPrevious} canNext={backendSelector.canNext} previous={backendSelector.previous} next={backendSelector.next} /><label className="checkbox-field"><input name="versioning_enabled" type="checkbox" defaultChecked={draft?.versioningEnabled ?? false} /> Versioning enabled</label>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button type="button" disabled={pending} onClick={dismiss}>Cancel</button><button className="primary" disabled={pending || indeterminate === 'create'}>{pending ? 'Creating...' : draft ? 'Create replacement' : directMappingsOnly ? 'Add mapping' : 'Create identity'}</button></div></form></Modal>}
    {action?.kind === 'edit' && <Modal title={directMappingsOnly ? 'Configure direct mapping' : 'Edit identity'} description="Access key, mode and secret are not changed by this form." onClose={dismiss} pending={pending}><form className="operation-form" onSubmit={confirm}>{directMappingsOnly && <label>Azure account<input name="azure_account" required pattern="[a-z0-9]{3,24}" readOnly={!action.identity.use_managed_identity} defaultValue={action.identity.azure_account} /></label>}<label>Default backend<select name="default_backend_id" value={selectedBackendId} onChange={event => setSelectedBackendId(event.target.value)}><option value="">Keep current selection</option>{backendOptions.map(backend => <option key={backend.id} value={backend.id} disabled={backend.disabled}>{backend.label}</option>)}</select></label><BackendSelectorPagination page={backendSelector.page} pending={backendSelector.query.isFetching} canPrevious={backendSelector.canPrevious} canNext={backendSelector.canNext} previous={backendSelector.previous} next={backendSelector.next} /><label className="checkbox-field"><input name="enabled" type="checkbox" disabled={action.identity.enabled === null} defaultChecked={action.identity.enabled === true} /> {action.identity.enabled === null ? 'Enabled state unavailable' : 'Enabled'}</label><label className="checkbox-field"><input name="versioning_enabled" type="checkbox" defaultChecked={action.identity.versioning_enabled} /> Versioning enabled</label>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button type="button" disabled={pending} onClick={dismiss}>Cancel</button><button className="primary" disabled={pending}>{pending ? 'Saving...' : 'Save'}</button></div></form></Modal>}
      {action && (action.kind === 'rotate' || action.kind === 'delete') && <DestructiveDialog title={action.kind === 'rotate' ? 'Rotate secret' : directMappingsOnly ? 'Remove direct mapping' : 'Delete identity'} description={action.kind === 'delete' ? directMappingsOnly ? directMappingRemovalDescription(action.identity) : `Revokes this identity and removes ${counts(action.identity)}. Azure containers and blobs are retained.` : 'Immediately invalidates the current secret and parent-revision temporary credentials.'} confirmLabel={`${action.kind === 'rotate' ? indeterminate === 'rotate' ? 'Rotate again' : 'Rotate' : directMappingsOnly ? 'Remove' : 'Delete'} ${action.identity.s3_access_key}`} pending={pending} onClose={dismiss} onConfirm={() => { void confirm() }}><p className="confirmation-name">{action.identity.s3_access_key}</p>{error && <ErrorBanner error={error} />}</DestructiveDialog>}
    {detailsKey && !directMappingsOnly && <Modal title="Identity details" description="Read-only identity metadata and control-plane dependencies." onClose={dismiss}>{selectedIdentity ? <dl className="identity-details">
      <dt>Identity ID</dt><dd>{selectedIdentity.credential_id ?? 'Unavailable'}</dd>
      <dt>Access key</dt><dd>{selectedIdentity.s3_access_key}</dd>
      <dt>Mode</dt><dd>{selectedIdentity.access_mode}</dd>
      <dt>Status</dt><dd>{selectedIdentity.enabled === null ? 'Unavailable' : selectedIdentity.enabled ? 'Enabled' : 'Disabled'}</dd>
      <dt>Azure account</dt><dd>{selectedIdentity.azure_account}</dd>
      <dt>Default backend</dt><dd>{selectedIdentity.default_backend_id ?? 'Legacy account route'}</dd>
      <dt>Versioning</dt><dd>{selectedIdentity.versioning_enabled ? 'Enabled' : 'Disabled'}</dd>
      <dt>Virtual mappings</dt><dd>{selectedIdentity.virtual_bucket_count ?? 'Unavailable'}</dd>
      <dt>Policy attachments</dt><dd>{selectedIdentity.policy_attachment_count ?? 'Unavailable'}</dd>
    </dl> : <p role="status">Identity metadata unavailable.</p>}<RefreshButton pending={identities.isFetching} refresh={() => { void identities.refetch() }} /></Modal>}
    {detailsKey && directMappingsOnly && <DirectMappingDetails
      identity={identities.isError ? undefined : identities.data?.find(identity => (identity.credential_id ?? identity.s3_access_key) === detailsKey)}
      backends={selectedBackend.data ? [selectedBackend.data] : backendFromPage ? [backendFromPage] : selectedBackend.error instanceof ApiError && selectedBackend.error.status === 404 ? [] : undefined}
      capabilities={capabilities.isError ? undefined : capabilities.data}
      onClose={dismiss}
    />}
    {oneTime && <EphemeralCredentials material={oneTime} dismiss={acknowledgeCredentials} acknowledgeLabel={virtualMappingWorkflow.current ? 'I stored these securely; continue' : undefined} pending={virtualMappingWorkflow.current && pending} />}
  </Page>
}
