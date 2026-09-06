import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Clock, Eye, Link, Plus, Power, ShieldCheck, Trash2, Unlink, X } from 'lucide-react'
import { api } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { controlKeys } from '../../api/query-keys'
import { DataTable, ErrorBanner, Page, RefreshButton } from '../../components/control'
import { completionGuard } from '../operations/state'
import { retainedLabel, type RoleDetail, type RoleOperation } from './role-state'
import RoleDialog from './RoleDialog'
import './roles.css'

export default function RolesPage() {
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const cursor = cursors[cursors.length - 1]
  const roles = useQuery({ queryKey: [...controlKeys.list('roles'), 'page', cursor], queryFn: async () => {
    const result = await api<Schema['AdminIamRolePage']>(`/admin/ui/roles?limit=100${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ''}`)
    if (!result || !Array.isArray(result.items) || result.items.length > 100 || !result.limits || !(result.next_after_id === null || typeof result.next_after_id === 'string')) throw new Error('Invalid role page response')
    return result
  } })
  const capabilities = useQuery(controlQueries.capabilities)
  const [selected, setSelected] = useState<RoleDetail | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [operation, setOperation] = useState<RoleOperation | null>(null)
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])

  async function load(id: string) {
    const request = guard.current.begin(); setPending(true); setError(null); setSelectedId(id); setSelected(null)
    try {
      const detail = await api<RoleDetail>(`/admin/ui/roles/${encodeURIComponent(id)}`)
      if (guard.current.current(request)) setSelected(detail)
    } catch (cause) { if (guard.current.current(request)) setError(new Error(cause instanceof Error ? cause.message : 'Role details unavailable')) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  function changed(detail: RoleDetail | null) {
    setSelected(detail); setSelectedId(detail?.role.id ?? null); setCursors([null])
  }

  const limits = selected?.limits ?? roles.data?.limits
  return <Page title="IAM roles" action={<div className="page-actions"><RefreshButton pending={roles.isFetching || pending} refresh={() => { void roles.refetch(); if (selectedId) void load(selectedId) }} /><button className="primary" disabled={!roles.data || roles.isError} onClick={() => setOperation('create')}><Plus size={17} /> Create role</button></div>}>
    {roles.isError && <ErrorBanner error={roles.error} retry={() => { void roles.refetch() }} />}
    {capabilities.data && !capabilities.data.assume_role_ready && <p className="role-notice" role="status">AssumeRole is not ready in the current runtime configuration.</p>}
    {(!roles.isError || roles.data) && <DataTable rows={roles.data?.items ?? []} rowKey={role => role.id} loading={roles.isPending} columns={[
      { label: 'Role', value: role => <span className="role-name">{role.role_path}{role.role_name}</span> },
      { label: 'Account', value: role => role.account_id },
      { label: 'Status', value: role => <span className={`role-status ${role.enabled ? 'enabled' : ''}`}>{role.enabled ? 'Enabled' : 'Disabled'}</span> },
      { label: 'Maximum duration', value: role => `${role.max_session_duration_seconds} s` },
      { label: 'Actions', value: role => <button className="icon-button" title="View role" aria-label={`View ${role.role_name}`} onClick={() => { void load(role.id) }}><Eye size={16} /></button> },
    ]} />}
    <div className="role-pagination"><button className="icon-button" title="Previous role page" aria-label="Previous role page" disabled={cursors.length === 1 || roles.isFetching} onClick={() => setCursors(current => current.slice(0, -1))}><ChevronLeft size={16} /></button><span>Page {cursors.length}</span><button className="icon-button" title="Next role page" aria-label="Next role page" disabled={!roles.data?.next_after_id || roles.isFetching} onClick={() => { if (roles.data?.next_after_id) setCursors(current => [...current, roles.data.next_after_id]) }}><ChevronRight size={16} /></button></div>
    {selectedId && <section className="role-details" aria-label="Role details"><div className="section-heading"><h2>{selected?.role.role_name ?? 'Role details'}</h2><button className="icon-button" title="Close details" aria-label="Close role details" onClick={() => { guard.current.cancel(); setSelected(null); setSelectedId(null); setPending(false); setError(null) }}><X size={16} /></button></div>
      {error && <ErrorBanner error={error} retry={() => { void load(selectedId) }} />}
      {pending && <p role="status">Loading role...</p>}
      {selected && <>
        <dl className="role-detail-grid"><dt>Role ARN</dt><dd>{selected.role.role_arn}</dd><dt>Role ID</dt><dd>{selected.role.role_id}</dd><dt>Resource owner</dt><dd>{selected.role.resource_credential_id}</dd><dt>Maximum duration</dt><dd>{selected.role.max_session_duration_seconds} seconds</dd><dt>Status</dt><dd>{selected.role.enabled ? 'Enabled' : 'Disabled'}</dd><dt>Revisions</dt><dd>Lifecycle {selected.role.lifecycle_revision} / Trust {selected.role.trust_revision} / Attachments {selected.role.attachment_revision}</dd><dt>Retained sessions</dt><dd>{retainedLabel(selected.retained_sessions)}</dd></dl>
        <div className="role-actions"><button onClick={() => setOperation('trust')}><ShieldCheck size={16} /> Replace trust</button><button onClick={() => setOperation('settings')}><Clock size={16} /> Change duration</button><button onClick={() => setOperation('enabled')}><Power size={16} /> {selected.role.enabled ? 'Disable role' : 'Enable role'}</button></div>
        <h3>Trust</h3><div className="role-trust-summary">{selected.trust.statements.map((statement, index) => <div key={index}><strong>{statement.effect}</strong><ul>{statement.principals.map(principal => <li key={principal}>{principal}</li>)}</ul>{statement.conditions.length > 0 ? <ul>{statement.conditions.map(condition => <li key={`${condition.operator}:${condition.key}`}>{condition.operator} / {condition.key} / Value hidden</li>)}</ul> : <p>No conditions</p>}</div>)}</div>
        <div className="section-heading"><h3>Attached policies</h3><button onClick={() => setOperation('attach')}><Link size={16} /> Attach policy</button></div>
        <DataTable rows={selected.policies} rowKey={policy => policy.id} columns={[{ label: 'Policy', value: policy => policy.name }, { label: 'Revision', value: policy => policy.revision }]} />
        <div className="role-actions"><button disabled={!selected.policies.length} onClick={() => setOperation('detach')}><Unlink size={16} /> Detach policy</button></div>
        <h3>Session retirement</h3><p>Retained rows: {retainedLabel(selected.retained_sessions)}. {selected.retained_sessions.deletion_eligible ? 'Eligible for deletion.' : selected.role.enabled ? 'Disable the role before retirement or deletion.' : 'Retained rows must reach zero before deletion.'}</p>
        <div className="role-actions"><button disabled={selected.role.enabled} onClick={() => setOperation('retire')}><Clock size={16} /> Retire sessions</button><button className="danger" disabled={!selected.retained_sessions.deletion_eligible} onClick={() => setOperation('delete')}><Trash2 size={16} /> Delete role</button></div>
      </>}
    </section>}
    {operation && limits && <RoleDialog operation={operation} initial={operation === 'create' ? undefined : selected ?? undefined} limits={limits} close={() => setOperation(null)} changed={changed} />}
  </Page>
}