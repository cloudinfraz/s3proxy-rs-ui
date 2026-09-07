import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Clipboard, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { controlKeys } from '../../api/query-keys'
import { DataTable, ErrorBanner, Page, RefreshButton } from '../../components/control'
import { deriveStsReadiness, guidanceExamples } from './sts-state'
import './sts.css'

function CopyBlock({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState(false)

  async function copy() {
    setError(false)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(id)
    } catch {
      setCopied(null)
      setError(true)
    }
  }

  return <div className="sts-code-block"><div className="sts-code-heading"><span>{label}</span><button className="icon-button" type="button" title={`Copy ${label}`} aria-label={`Copy ${label}`} onClick={() => { void copy() }}>{copied === id ? <Check size={16} /> : <Clipboard size={16} />}</button></div><pre><code>{value}</code></pre><span className="visually-hidden" role="status">{copied === id ? `${label} copied` : error ? `${label} could not be copied` : ''}</span></div>
}

export default function TemporaryCredentialsPage() {
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const cursor = cursors[cursors.length - 1]
  const capabilities = useQuery(controlQueries.capabilities)
  const roles = useQuery({ queryKey: [...controlKeys.list('roles'), 'sts-page', cursor], queryFn: async () => {
    const result = await api<Schema['AdminIamRolePage']>(`/admin/ui/roles?limit=100${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ''}`)
    if (!result || !Array.isArray(result.items) || result.items.length > 100 || !(result.next_after_id === null || typeof result.next_after_id === 'string')) throw new Error('Invalid role page response')
    return result
  } })
  const currentCapabilities = capabilities.isError ? null : capabilities.data
  const state = currentCapabilities ? deriveStsReadiness(currentCapabilities) : null
  const examples = currentCapabilities ? guidanceExamples(currentCapabilities) : null

  return <Page title="Temporary credentials" subtitle="AssumeRole readiness, client endpoints, and role session boundaries" action={<RefreshButton pending={capabilities.isFetching || roles.isFetching} refresh={() => { void capabilities.refetch(); void roles.refetch() }} />}>
    {capabilities.isError && <ErrorBanner error={capabilities.error} retry={() => { void capabilities.refetch() }} />}
    {roles.isError && <ErrorBanner error={roles.error} retry={() => { void roles.refetch() }} />}

    <section className="sts-section" aria-labelledby="sts-readiness-heading">
      <div className="section-heading"><h2 id="sts-readiness-heading">AssumeRole readiness</h2>{state && <span className={`sts-status sts-status-${state.code}`}>{state.ready ? 'Ready' : 'Not ready'}</span>}</div>
      {capabilities.isPending && <p role="status">Loading runtime capabilities...</p>}
      {state && <><h3>{state.title}</h3><p>{state.detail}</p><dl className="sts-facts"><dt>STS transport</dt><dd>{currentCapabilities?.sts_enabled ? 'Enabled' : 'Disabled'}</dd><dt>IAM AssumeRole</dt><dd>{currentCapabilities?.iam_assume_role_enabled ? 'Enabled' : 'Disabled'}</dd><dt>IAM account</dt><dd>{currentCapabilities?.iam_account_configured ? 'Configured' : 'Not configured'}</dd></dl></>}
    </section>

    {currentCapabilities && <section className="sts-section" aria-labelledby="sts-endpoints-heading"><h2 id="sts-endpoints-heading">Client endpoints</h2><dl className="sts-endpoints"><dt>STS issuance endpoint</dt><dd>{currentCapabilities.public_sts_endpoint ?? 'Not configured'}</dd><dt>Public S3 data endpoint</dt><dd>{currentCapabilities.public_s3_endpoint ?? 'Not configured'}</dd></dl><p>AssumeRole issuance is signed for service <code>sts</code>. Temporary S3 requests are signed for service <code>s3</code>. These client endpoints are configured independently and are not inferred from this control page.</p></section>}

    <section className="sts-section" aria-labelledby="sts-duration-heading"><div className="section-heading"><div><h2 id="sts-duration-heading">Session duration</h2><p>An AssumeRole request that omits duration uses the fixed 3600-second default. Each role has a configurable role-specific maximum.</p></div><Link className="secondary-link" to="/iam-roles">Manage IAM roles</Link></div>
      <DataTable rows={roles.data?.items ?? []} rowKey={role => role.id} loading={roles.isPending} columns={[
        { label: 'Role', value: role => `${role.role_path}${role.role_name}` },
        { label: 'Status', value: role => role.enabled ? 'Enabled' : 'Disabled' },
        { label: 'Maximum duration', value: role => `${role.max_session_duration_seconds} seconds` },
        { label: 'Workflow', value: () => <Link to="/iam-roles">Review role</Link> },
      ]} />
      <div className="sts-pagination"><button className="icon-button" title="Previous role page" aria-label="Previous role page" disabled={cursors.length === 1 || roles.isFetching} onClick={() => setCursors(current => current.slice(0, -1))}><ChevronLeft size={16} /></button><span>Page {cursors.length}</span><button className="icon-button" title="Next role page" aria-label="Next role page" disabled={!roles.data?.next_after_id || roles.isFetching} onClick={() => { if (roles.data?.next_after_id) setCursors(current => [...current, roles.data.next_after_id]) }}><ChevronRight size={16} /></button></div>
    </section>

    {examples && <section className="sts-section" aria-labelledby="sts-client-heading"><h2 id="sts-client-heading">AWS client configuration</h2><p>Supply the long-term S3 credential only to the STS client outside the browser. Use all three returned temporary credential fields for S3 requests.</p><div className="sts-code-grid"><CopyBlock id="cli-issue" label="AWS CLI: issue credentials" value={examples.cliAssumeRole} /><CopyBlock id="cli-s3" label="AWS CLI: use credentials with S3" value={examples.cliS3} /><CopyBlock id="javascript" label="AWS SDK for JavaScript v3" value={examples.javascript} /></div></section>}

    <section className="sts-section" aria-labelledby="sts-revocation-heading"><h2 id="sts-revocation-heading">Credential changes and retirement</h2><dl className="sts-guidance"><dt>Parent credential revision</dt><dd>Invalidates sessions issued from the previous parent revision.</dd><dt>Role owner or lifecycle revision</dt><dd>Invalidates sessions issued under the previous role lifecycle.</dd><dt>Trust policy</dt><dd>Controls future issuance and does not independently retire an existing session.</dd><dt>Role and managed policies</dt><dd>Change the permissions evaluated for active sessions.</dd><dt>Role retirement</dt><dd>Disable the role, then use bounded retirement batches from the IAM role workflow.</dd></dl><Link className="secondary-link" to="/iam-roles"><RefreshCw size={15} /> Open role retirement</Link></section>
  </Page>
}
