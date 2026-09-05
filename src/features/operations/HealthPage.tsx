import { useQuery } from '@tanstack/react-query'
import { controlQueries, type Schema } from '../../api/control'
import { EmptyState, ErrorBanner, Page, RefreshButton } from '../../components/control'

export function HealthSummary({ health }: { health: Schema['AdminHealthResponse'] }) {
  const facts = [
    ['Runtime', health.status], ['Version', health.version],
    ['Cache', health.cache.available ? health.cache.mode : 'Unavailable'],
    ['Database', health.database ? (health.database.connected && health.database.schema_valid ? 'Ready' : 'Not ready') : 'Not configured'],
    ['Authorization', health.authorization.mode],
    ['Policy resolver', health.authorization.resolver_ready ? 'Ready' : 'Not ready'],
    ['Multipart persistence', health.multipart.persistence],
    ['Updated', health.timestamp],
  ]
  return <dl className="health-grid">{facts.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
}

export function HealthPanel() {
  const query = useQuery({ ...controlQueries.health, refetchInterval: 30_000 })
  return <section className="section health-section" aria-label="Runtime status"><div className="section-heading"><h2>Runtime status</h2><RefreshButton pending={query.isFetching} refresh={() => { void query.refetch() }} /></div><div className="refresh-status" role="status">{query.isFetching ? 'Refreshing' : query.isError && query.data ? 'Last successful reading' : 'Current reading'}</div>{query.isError && <ErrorBanner error={query.error} retry={() => { void query.refetch() }} />}{query.data ? <HealthSummary health={query.data} /> : !query.isError && <EmptyState loading />}</section>
}

export default function HealthPage() {
  return <Page title="Health"><HealthPanel /></Page>
}