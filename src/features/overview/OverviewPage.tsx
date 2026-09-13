import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import { controlQueries } from '../../api/control'
import { ErrorBanner, Page } from '../../components/control'
import { HealthPanel } from '../operations/HealthPage'
import { presentFinding } from './readiness'

export default function OverviewPage() {
  const overview = useQuery(controlQueries.overview)
  const [readinessCursors, setReadinessCursors] = useState<Array<string | null>>([null])
  const readinessCursor = readinessCursors.at(-1) ?? null
  const readiness = useQuery(controlQueries.readiness(readinessCursor))
  const readinessPage = readinessCursors.length
  const readinessStart = (readinessPage - 1) * 20 + 1
  const readinessEnd = readinessStart + (readiness.data?.items.length ?? 0) - 1
  const readinessPageCount = Math.max(1, Math.ceil((readiness.data?.finding_count ?? 0) / 20))
  const readinessRange = readiness.data?.items.length === 0
    ? '0'
    : readiness.data?.items.length === 1 ? `${readinessStart}` : `${readinessStart}-${readinessEnd}`
  const counts = [
    { label: 'S3 identities', href: '/credentials', count: overview.data?.identity_count },
    { label: 'Bucket routing', href: '/buckets', count: overview.data?.bucket_routing_count },
    { label: 'Azure backends', href: '/azure-backends', count: overview.data?.backend_count },
    { label: 'Policies', href: '/policies', count: overview.data?.policy_count },
  ]

  function nextReadinessPage() {
    const nextCursor = readiness.data?.next_after_key
    if (nextCursor) setReadinessCursors(current => [...current, nextCursor])
  }

  return <Page title="Overview">
    <div className="metric-grid">{counts.map(({ label, href, count }) => <section className="metric" key={href}>
      <Link to={href}>{label}</Link>
      <strong>{count ?? (overview.isError ? 'Unavailable' : '-')}</strong>
      {overview.isError && <ErrorBanner error={new Error(overview.data ? 'Refresh failed; showing last count' : 'Count unavailable')} retry={() => { void overview.refetch() }} />}
    </section>)}</div>
    <section className="section readiness-section" aria-labelledby="configuration-readiness-heading">
      <div className="section-heading">
        <h2 id="configuration-readiness-heading">Configuration readiness</h2>
        {readiness.data && <span className="status-label">{readiness.data.status === 'ready' ? 'Ready' : 'Needs attention'}</span>}
        <button className="icon-button" aria-label="Refresh configuration diagnostics" title="Refresh configuration diagnostics" disabled={readiness.isFetching} onClick={() => { void readiness.refetch() }}><RefreshCw size={17} /></button>
      </div>
      {readiness.isPending && <p role="status">Loading configuration diagnostics...</p>}
      {readiness.isError && !readiness.data && <ErrorBanner error={new Error('Configuration diagnostics unavailable.')} retry={() => { void readiness.refetch() }} retryLabel="Retry configuration diagnostics" />}
      {readiness.isError && readiness.data && <ErrorBanner error={new Error(`Refresh failed; showing diagnostics from ${readiness.data.evaluated_at}.`)} retry={() => { void readiness.refetch() }} retryLabel="Retry configuration diagnostics" />}
      {readiness.data?.status === 'ready' && <p className="readiness-clear"><CheckCircle2 size={17} /> No configuration issues found.</p>}
      {readiness.data?.status === 'attention' && <>
        <div className="readiness-pagination" aria-label="Configuration findings pagination">
          <button className="icon-button" aria-label="Previous configuration findings page" title="Previous page" disabled={readinessPage === 1 || readiness.isFetching} onClick={() => setReadinessCursors(current => current.slice(0, -1))}><ChevronLeft size={16} /></button>
          <span>Page {readinessPage} of {readinessPageCount}</span>
          <button className="icon-button" aria-label="Next configuration findings page" title="Next page" disabled={!readiness.data.next_after_key || readiness.isFetching} onClick={nextReadinessPage}><ChevronRight size={16} /></button>
        </div>
        <p>Showing {readinessRange} of {readiness.data.finding_count} findings</p>
        <ul className="findings">{readiness.data.items.map(finding => {
          const presented = presentFinding(finding)
          return <li key={finding.key}><TriangleAlert size={17} /><span>{presented.message}</span><Link to={presented.href}>Review</Link></li>
        })}</ul>
      </>}
    </section>
    <HealthPanel />
  </Page>
}
