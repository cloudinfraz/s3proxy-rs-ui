import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { CircleHelp } from 'lucide-react'
import { controlQueries } from '../../api/control'
import { ErrorBanner, Page } from '../../components/control'
import { HealthPanel } from '../operations/HealthPage'

export default function OverviewPage() {
  const overview = useQuery(controlQueries.overview)
  const counts = [
    { label: 'S3 identities', href: '/credentials', count: overview.data?.identity_count },
    { label: 'Bucket routing', href: '/buckets', count: overview.data?.bucket_routing_count },
    { label: 'Azure backends', href: '/azure-backends', count: overview.data?.backend_count },
    { label: 'Policies', href: '/policies', count: overview.data?.policy_count },
  ]
  return <Page title="Overview"><div className="metric-grid">{counts.map(({ label, href, count }) => <section className="metric" key={href}><Link to={href}>{label}</Link><strong>{count ?? (overview.isError ? 'Unavailable' : '-')}</strong>{overview.isError && <ErrorBanner error={new Error(overview.data ? 'Refresh failed; showing last count' : 'Count unavailable')} retry={() => { void overview.refetch() }} />}</section>)}</div><section className="section readiness-section"><div className="section-heading"><h2>Configuration readiness</h2><span className="status-label">Unavailable</span></div><ul className="findings"><li><CircleHelp size={17} /><span>Configuration readiness requires an authoritative backend summary.</span></li></ul></section><HealthPanel /></Page>
}