import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { controlQueries } from '../../api/control'
import { DataTable, ErrorBanner, Page, RefreshButton } from '../../components/control'
import { auditPage } from './state'

export default function AuditPage() {
  const [limit, setLimit] = useState(100)
  const [page, setPage] = useState(0)
  const query = useQuery(controlQueries.audit(limit))
  const window = auditPage(query.data ?? [], page)
  return <Page title="Audit" action={<RefreshButton pending={query.isFetching} refresh={() => { void query.refetch() }} />}><div className="operations-toolbar"><label>Recent events<select value={limit} onChange={event => { setLimit(Number(event.target.value)); setPage(0) }}>{[25, 50, 100, 200].map(value => <option key={value} value={value}>Latest {value}</option>)}</select></label><span role="status">{query.isFetching ? 'Refreshing' : `${query.data?.length ?? 0} events in this window`}</span></div>{query.isError && <ErrorBanner error={query.error} retry={() => { void query.refetch() }} />}{(!query.isError || query.data) && <DataTable rows={window.rows} loading={query.isPending} rowKey={row => row.id} columns={[{ label: 'Time', value: row => row.created_at }, { label: 'Entity', value: row => row.entity_type }, { label: 'Action', value: row => row.action }, { label: 'Actor', value: row => row.changed_by ?? '-' }]} />}<div className="pagination"><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={window.index === 0 || query.isPending} onClick={() => setPage(window.index - 1)}><ChevronLeft size={18} /></button><span>Page {window.index + 1} of {window.pages}</span><button className="icon-button" title="Next page" aria-label="Next page" disabled={window.index + 1 >= window.pages || query.isPending} onClick={() => setPage(window.index + 1)}><ChevronRight size={18} /></button></div></Page>
}