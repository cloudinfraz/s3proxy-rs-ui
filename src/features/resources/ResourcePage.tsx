import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import { fetchResourceRows, type ResourceListPath } from '../../api/resources'
import { controlKeys, invalidateControl, type ControlResource } from '../../api/query-keys'
import { DataTable, DestructiveDialog, ErrorBanner, Modal, Page } from '../../components/control'
import { display } from '../../components/display'
import { completionGuard } from '../operations/state'
import { virtualBucketAliasError } from './validation'

type RecordValue = Record<string, unknown>
type Field = { key: string; label: string; type?: string; required?: boolean }
type ResourceConfig = { resource: ControlResource; path: ResourceListPath; title: string; identityKey: string; defaults?: RecordValue; columns: Array<{ key: string; label: string }>; fields: Field[] }
const resources: Record<string, ResourceConfig> = {
  credentials: { resource: 'identities', path: '/admin/credentials', title: 'S3 identities', identityKey: 's3_access_key', defaults: { use_managed_identity: true, access_mode: 'direct', versioning_enabled: false }, columns: [{ key: 's3_access_key', label: 'Access key' }, { key: 'azure_account', label: 'Azure account' }, { key: 'access_mode', label: 'Mode' }, { key: 'versioning_enabled', label: 'Versioning' }], fields: [{ key: 's3_access_key', label: 'S3 access key' }, { key: 's3_secret_key', label: 'S3 secret key', type: 'password', required: true }, { key: 'azure_account', label: 'Azure account', required: true }] },
  buckets: { resource: 'buckets', path: '/admin/virtual-buckets', title: 'Bucket routing', identityKey: 'id', defaults: { backend_id: null, endpoint_prefix: null }, columns: [{ key: 'virtual_bucket_name', label: 'S3 bucket' }, { key: 'azure_container', label: 'Container' }, { key: 'credential_id', label: 'Identity' }, { key: 'enabled', label: 'Status' }], fields: [{ key: 'virtual_bucket_name', label: 'S3 bucket', required: true }, { key: 'azure_container', label: 'Azure container', required: true }, { key: 'credential_id', label: 'Credential ID', required: true }] },
  policies: { resource: 'policies', path: '/admin/policies', title: 'Policies', identityKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'updated_at', label: 'Updated' }], fields: [{ key: 'name', label: 'Name', required: true }, { key: 'description', label: 'Description' }, { key: 'document', label: 'Policy document', required: true }] },
}

export default function ResourcePage({ resourceName }: { resourceName: string }) {
  const config = resources[resourceName]
  const query = useQuery({ queryKey: controlKeys.list(config.resource), queryFn: () => fetchResourceRows(config.path) })
  const client = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])
  function close() { guard.current.cancel(); setCreating(false); setDeleting(null); setPending(false); setError(null) }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const body: RecordValue = { ...config.defaults }
    const form = new FormData(event.currentTarget)
    try { for (const field of config.fields) { const value = form.get(field.key); if (value) body[field.key] = field.key === 'document' ? JSON.parse(String(value)) : value } }
    catch { setError(new Error('Policy document must be valid JSON')); return }
    if (config.resource === 'buckets') {
      const aliasError = virtualBucketAliasError(body.virtual_bucket_name)
      if (aliasError) { setError(new Error(aliasError)); return }
    }
    const request = guard.current.begin()
    setPending(true)
    setError(null)
    try { await api(config.path, { method: 'POST', body: JSON.stringify(body) }); void invalidateControl(client); if (guard.current.current(request)) close() }
    catch { if (guard.current.current(request)) setError(new Error('Create failed. Check the values and retry.')) }
    finally { if (guard.current.current(request)) setPending(false) }
  }
  async function remove() {
    if (deleting === null || pending) return
    const request = guard.current.begin()
    setPending(true)
    try { await api(`${config.path}/${encodeURIComponent(deleting)}`, { method: 'DELETE' }); void invalidateControl(client); if (guard.current.current(request)) close() }
    catch { if (guard.current.current(request)) setError(new Error('Delete failed. Retry after checking the resource.')) }
    finally { if (guard.current.current(request)) setPending(false) }
  }
  return <Page title={config.title} action={<button className="primary" onClick={() => { close(); setCreating(true) }}><Plus size={17} /> Add {config.title.toLowerCase()}</button>}>
    {query.isError && <ErrorBanner error={query.error} retry={() => { void query.refetch() }} />}
    {(!query.isError || query.data) && <DataTable rows={query.data ?? []} loading={query.isPending} rowKey={row => String(row.id ?? row.credential_id ?? row.name ?? row.s3_access_key)} columns={[...config.columns.map(column => ({ label: column.label, value: (row: RecordValue) => display(row[column.key]) })), { label: 'Actions', value: row => <button className="icon-button danger" aria-label="Delete record" title="Delete record" onClick={() => { close(); setDeleting(String(row[config.identityKey])) }}><Trash2 size={16} /></button> }]} />}
    {creating && <Modal title={`Add ${config.title.toLowerCase()}`} description={config.title} onClose={close} pending={pending}><form className="operation-form" onSubmit={submit}>{config.fields.map(field => <label key={field.key}>{field.label}{field.key === 'document' ? <textarea name={field.key} required rows={8} defaultValue={'{"Version":"2012-10-17","Statement":[]}'} /> : <input name={field.key} type={field.type ?? 'text'} required={field.required} />}</label>)}{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button type="button" disabled={pending} onClick={close}>Cancel</button><button className="primary" disabled={pending}>{pending ? 'Saving...' : 'Save'}</button></div></form></Modal>}
    {deleting !== null && <DestructiveDialog title="Delete record" description={config.resource === 'buckets' ? 'Removes routing metadata only. Azure containers and data are not deleted.' : 'Removes this control-plane record and may affect dependent access.'} confirmLabel={`Delete ${deleting}`} pending={pending} onClose={close} onConfirm={() => { void remove() }}>{error && <ErrorBanner error={error} />}</DestructiveDialog>}
  </Page>
}