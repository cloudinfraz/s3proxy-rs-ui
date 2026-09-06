import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AlertTriangle, CircleHelp } from 'lucide-react'
import { controlQueries } from '../../api/control'
import { ErrorBanner, Page } from '../../components/control'
import { HealthPanel } from '../operations/HealthPage'
import { deriveReadiness } from './readiness'

export default function OverviewPage() {
  const identities = useQuery(controlQueries.identities)
  const buckets = useQuery(controlQueries.buckets)
  const backends = useQuery(controlQueries.backends)
  const policies = useQuery(controlQueries.policies)
  const keys = useQuery(controlQueries.keys)
  const roles = useQuery(controlQueries.roles)
  const capabilities = useQuery(controlQueries.capabilities)
  const counts = [
    { label: 'S3 identities', href: '/credentials', query: identities },
    { label: 'Bucket routing', href: '/buckets', query: buckets },
    { label: 'Azure backends', href: '/backends', query: backends },
    { label: 'Policies', href: '/policies', query: policies },
  ]
  const findings = deriveReadiness({ capabilities: capabilities.data, identities: identities.data, buckets: buckets.data, backends: backends.data, keys: keys.data, roles: roles.data?.next_after_id === null ? roles.data.items : undefined, now: Date.now() })
  const pending = [identities, buckets, backends, keys, roles, capabilities].some(query => query.isPending)
  return <Page title="Overview"><div className="metric-grid">{counts.map(({ label, href, query }) => <section className="metric" key={href}><Link to={href}>{label}</Link><strong>{query.data ? query.data.length : query.isError ? 'Unavailable' : '-'}</strong>{query.isError && <ErrorBanner error={new Error(query.data ? 'Refresh failed; showing last count' : 'Count unavailable')} retry={() => { void query.refetch() }} />}</section>)}</div><section className="section readiness-section"><div className="section-heading"><h2>Configuration readiness</h2><span className="status-label">{pending ? 'Loading' : `${findings.length} findings`}</span></div>{[capabilities, keys, roles].filter(query => query.isError).map((query, index) => <ErrorBanner key={index} error={new Error('Readiness metadata unavailable')} retry={() => { void query.refetch() }} />)}<ul className="findings">{findings.map(finding => <li key={finding.code}>{finding.severity === 'unknown' ? <CircleHelp size={17} /> : <AlertTriangle size={17} />}<span>{finding.message}</span>{finding.href && <Link to={finding.href}>Review</Link>}</li>)}</ul>{!pending && !findings.length && <p className="readiness-clear">No configuration findings</p>}</section><HealthPanel /></Page>
}