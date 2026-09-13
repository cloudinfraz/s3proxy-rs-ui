import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Clock, Eye, Link, MoreHorizontal, Plus, Power, ShieldCheck, Trash2, Unlink } from 'lucide-react'
import { DropdownMenu } from '@radix-ui/themes'
import { controlQueries } from '../../api/control'
import { invokeOperation } from '../../api/operations'
import { controlKeys } from '../../api/query-keys'
import { DataTable, DialogFlow, ErrorBanner, Modal, Page, RefreshButton } from '../../components/control'
import { completionGuard } from '../operations/state'
import { retainedLabel, type RoleDetail, type RoleOperation } from './role-state'
import RoleDialog from './RoleDialog'
import './roles.css'

export default function RolesPage() {
  const createButton = useRef<HTMLButtonElement>(null)
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const cursor = cursors[cursors.length - 1]
  const roles = useQuery({ queryKey: [...controlKeys.list('roles'), 'page', cursor], queryFn: async ({ signal }) => {
    const result = await invokeOperation('listAdminRoles', { parameters: { query: { limit: 100, after_id: cursor ?? undefined } }, signal })
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
      const detail = await invokeOperation('getAdminRole', { parameters: { path: { role_id: id } } })
      if (guard.current.current(request)) setSelected(detail)
    } catch (cause) { if (guard.current.current(request)) setError(new Error(cause instanceof Error ? cause.message : 'Role details unavailable')) }
    finally { if (guard.current.current(request)) setPending(false) }
  }

  function changed(detail: RoleDetail | null) {
    setSelected(detail); setSelectedId(detail?.role.id ?? null)
    if (operation === 'create') setCursors([null])
  }

  function dismissDetail() {
    guard.current.cancel(); setSelected(null); setSelectedId(null); setPending(false); setError(null)
  }

  const limits = selected?.limits ?? roles.data?.limits
  return <Page title="IAM roles" action={<div className="page-actions"><RefreshButton pending={roles.isFetching || pending} refresh={() => { void roles.refetch(); if (selectedId) void load(selectedId) }} /><button ref={createButton} className="primary" disabled={!roles.data || roles.isError} onClick={() => setOperation('create')}><Plus size={17} /> Create role</button></div>}>
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
    {(selectedId || operation) && <DialogFlow fallbackFocus={createButton}>
    {selectedId && !operation && <Modal wide title={selected?.role.role_name ?? 'Role details'} description="IAM role details" onClose={dismissDetail} actions={<>
      <RefreshButton pending={pending} refresh={() => { void load(selectedId) }} />
      <button disabled={!selected || pending || Boolean(error)} onClick={() => setOperation('trust')}><ShieldCheck size={16} />Replace trust</button>
      <button disabled={!selected || pending || Boolean(error)} onClick={() => setOperation('settings')}><Clock size={16} />Change duration</button>
      <DropdownMenu.Root><DropdownMenu.Trigger><button disabled={!selected || pending || Boolean(error)}><MoreHorizontal size={16} />Actions</button></DropdownMenu.Trigger><DropdownMenu.Content>
        <DropdownMenu.Item onSelect={() => setOperation('enabled')}><Power size={16} />{selected?.role.enabled ? 'Disable role' : 'Enable role'}</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => setOperation('attach')}><Link size={16} />Attach policy</DropdownMenu.Item>
        <DropdownMenu.Item disabled={!selected?.policies.length} onSelect={() => setOperation('detach')}><Unlink size={16} />Detach policy</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item disabled={!selected || selected.role.enabled} onSelect={() => setOperation('retire')}><Clock size={16} />Retire sessions</DropdownMenu.Item>
        <DropdownMenu.Item color="red" disabled={!selected?.retained_sessions.deletion_eligible} onSelect={() => setOperation('delete')}><Trash2 size={16} />Delete role</DropdownMenu.Item>
      </DropdownMenu.Content></DropdownMenu.Root>
    </>}><section className="role-detail-content" aria-label="Role details">
      {error && <ErrorBanner error={error} retry={() => { void load(selectedId) }} />}
      {pending && <p role="status">Loading role...</p>}
      {selected && <>
        <dl className="role-detail-grid"><dt>Role ARN</dt><dd>{selected.role.role_arn}</dd><dt>Role ID</dt><dd>{selected.role.role_id}</dd><dt>Resource owner</dt><dd>{selected.role.resource_credential_id}</dd><dt>Maximum duration</dt><dd>{selected.role.max_session_duration_seconds} seconds</dd><dt>Status</dt><dd>{selected.role.enabled ? 'Enabled' : 'Disabled'}</dd><dt>Revisions</dt><dd>Lifecycle {selected.role.lifecycle_revision} / Trust {selected.role.trust_revision} / Attachments {selected.role.attachment_revision}</dd><dt>Retained sessions</dt><dd>{retainedLabel(selected.retained_sessions)}</dd></dl>
        <h3>Trust</h3><div className="role-trust-summary">{selected.trust.statements.map((statement, index) => <div key={index}><strong>{statement.effect}</strong><ul>{statement.principals.map(principal => <li key={principal}>{principal}</li>)}</ul>{statement.conditions.length > 0 ? <ul>{statement.conditions.map(condition => <li key={`${condition.operator}:${condition.key}`}>{condition.operator} / {condition.key} / Value hidden</li>)}</ul> : <p>No conditions</p>}</div>)}</div>
        <h3>Attached policies</h3>
        <DataTable rows={selected.policies} rowKey={policy => policy.id} columns={[{ label: 'Policy', value: policy => policy.name }, { label: 'Revision', value: policy => policy.revision }]} />
        <h3>Session retirement</h3><p>Retained rows: {retainedLabel(selected.retained_sessions)}. {selected.retained_sessions.deletion_eligible ? 'Eligible for deletion.' : selected.role.enabled ? 'Disable the role before retirement or deletion.' : 'Retained rows must reach zero before deletion.'}</p>
      </>}
    </section></Modal>}
    {operation && limits && <RoleDialog operation={operation} initial={operation === 'create' ? undefined : selected ?? undefined} limits={limits} close={() => setOperation(null)} changed={changed} />}
    </DialogFlow>}
  </Page>
}