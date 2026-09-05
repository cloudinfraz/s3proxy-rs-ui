import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Power } from 'lucide-react'
import { api, ApiError } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { invalidateControl } from '../../api/query-keys'
import { DataTable, ErrorBanner, Modal, Page, RefreshButton } from '../../components/control'
import { completionGuard } from './state'

type KeyAction = { key: Schema['AdminApiKeySummary']; kind: 'delete' | 'toggle' }

export default function AdminKeysPage() {
  const query = useQuery(controlQueries.keys)
  const client = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [action, setAction] = useState<KeyAction | null>(null)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])

  function dismiss() {
    guard.current.cancel()
    setCreating(false)
    setSecret(null)
    setPending(false)
    setError(null)
    setAction(null)
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const days = String(form.get('expires_in_days') ?? '')
    const body: Schema['CreateAdminApiKeyRequest'] = { key_name: String(form.get('key_name')), description: String(form.get('description') || '') || null, expires_in_days: days ? Number(days) : null, created_by: 'browser-ui' }
    const request = guard.current.begin()
    setPending(true)
    setError(null)
    try {
      const result = await api<Schema['CreateAdminApiKeyResponse']>('/admin/api-keys', { method: 'POST', body: JSON.stringify(body) })
      void invalidateControl(client)
      if (!guard.current.current(request)) return
      if (!result.api_key) throw new Error('The server did not return a one-time key')
      setSecret(result.api_key)
      setCreating(false)
    } catch (cause) {
      if (guard.current.current(request)) setError(new Error(cause instanceof ApiError ? `Admin key creation failed (HTTP ${cause.status})` : 'Admin key creation failed'))
    } finally {
      if (guard.current.current(request)) setPending(false)
    }
  }

  async function confirm() {
    if (!action || pending) return
    const request = guard.current.begin()
    setPending(true)
    setError(null)
    try {
      await api<void>(`/admin/api-keys/${encodeURIComponent(action.key.key_name)}`, action.kind === 'delete' ? { method: 'DELETE' } : { method: 'PUT', body: JSON.stringify({ enabled: !action.key.enabled } satisfies Schema['UpdateAdminApiKeyRequest']) })
      void invalidateControl(client)
      if (guard.current.current(request)) dismiss()
    } catch (cause) {
      if (guard.current.current(request)) setError(new Error(cause instanceof ApiError ? `Admin key update failed (HTTP ${cause.status})` : 'Admin key update failed'))
    } finally {
      if (guard.current.current(request)) setPending(false)
    }
  }

  return <Page title="Admin keys" action={<div className="page-actions"><RefreshButton pending={query.isFetching} refresh={() => { void query.refetch() }} /><button className="primary" onClick={() => { dismiss(); setCreating(true) }}><Plus size={17} /> Create admin key</button></div>}>
    {query.isError && <ErrorBanner error={query.error} retry={() => { void query.refetch() }} />}
    {(!query.isError || query.data) && <DataTable rows={query.data ?? []} rowKey={key => key.id} loading={query.isPending} columns={[
      { label: 'Name', value: key => key.key_name }, { label: 'Status', value: key => key.status },
      { label: 'Expires', value: key => key.expires_at ?? 'Never' }, { label: 'Last used', value: key => key.last_used_at ?? 'Never' },
      { label: 'Actions', value: key => <div className="row-actions"><button className="icon-button" title={key.enabled ? 'Disable key' : 'Enable key'} aria-label={`${key.enabled ? 'Disable' : 'Enable'} ${key.key_name}`} onClick={() => { dismiss(); setAction({ key, kind: 'toggle' }) }}><Power size={17} /></button><button className="icon-button danger" title="Delete key" aria-label={`Delete ${key.key_name}`} onClick={() => { dismiss(); setAction({ key, kind: 'delete' }) }}><Trash2 size={17} /></button></div> },
    ]} />}
    {creating && <Modal title="Create admin key" description="New administrative access" onClose={dismiss}><form className="operation-form" onSubmit={create}><label>Name<input name="key_name" required maxLength={100} autoComplete="off" /></label><label>Description<input name="description" maxLength={500} /></label><label>Expires in days<input name="expires_in_days" type="number" min={1} step={1} /></label>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button type="button" onClick={dismiss}>Cancel</button><button className="primary" disabled={pending}>{pending ? 'Creating...' : 'Create key'}</button></div></form></Modal>}
    {secret && <Modal title="One-time admin key" description="This key will not be available after dismissal." onClose={dismiss}><code className="one-time-key">{secret}</code><div className="dialog-actions"><button className="primary" onClick={dismiss}>Dismiss</button></div></Modal>}
    {action && <Modal title={`${action.kind === 'delete' ? 'Delete' : action.key.enabled ? 'Disable' : 'Enable'} admin key`} description={action.kind === 'delete' ? 'Permanently revokes this administrative credential and its sessions. This cannot be undone.' : action.key.enabled ? 'Revokes administrative access for this key and its sessions. You may lose your current session.' : 'Restores administrative access for this key.'} onClose={dismiss}><p className="confirmation-name">{action.key.key_name}</p>{error && <ErrorBanner error={error} />}<div className="dialog-actions"><button onClick={dismiss}>Cancel</button><button className="primary" disabled={pending} onClick={() => { void confirm() }}>{pending ? 'Applying...' : 'Confirm'}</button></div></Modal>}
  </Page>
}