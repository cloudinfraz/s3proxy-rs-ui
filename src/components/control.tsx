import type { ReactNode } from 'react'
import { Dialog } from '@radix-ui/themes'
import { Box, RefreshCw, X } from 'lucide-react'

export function Page({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">Administration</div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</div>
}

export function ErrorBanner({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div className="error-banner" role="alert"><span>{error instanceof Error ? error.message : 'Request failed'}</span>{retry && <button onClick={retry}><RefreshCw size={15} /> Retry</button>}</div>
}

export function RefreshButton({ pending, refresh }: { pending: boolean; refresh: () => void }) {
  return <button className="icon-button" aria-label="Refresh" title="Refresh" disabled={pending} onClick={refresh}><RefreshCw size={17} className={pending ? 'refreshing' : ''} /></button>
}

export function EmptyState({ loading = false }: { loading?: boolean }) {
  return <div className="empty-state" role="status"><Box size={22} /><strong>{loading ? 'Loading...' : 'No records'}</strong></div>
}

export function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Content maxWidth="520px" className="control-dialog"><div className="dialog-heading"><Dialog.Title>{title}</Dialog.Title><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div><Dialog.Description>{description}</Dialog.Description>{children}</Dialog.Content></Dialog.Root>
}

export type Column<Row> = { label: string; value: (row: Row) => ReactNode }
export function DataTable<Row>({ rows, columns, rowKey, loading = false }: { rows: readonly Row[]; columns: Column<Row>[]; rowKey: (row: Row) => string; loading?: boolean }) {
  if (loading || !rows.length) return <EmptyState loading={loading} />
  return <div className="table-wrap" tabIndex={0} aria-label="Scrollable records"><table><thead><tr>{columns.map(column => <th scope="col" key={column.label}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.label}><span className="cell-label" aria-hidden="true">{column.label}</span>{column.value(row)}</td>)}</tr>)}</tbody></table></div>
}
