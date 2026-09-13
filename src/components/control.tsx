import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AlertDialog, Dialog } from '@radix-ui/themes'
import { Box, RefreshCw, X } from 'lucide-react'

function useMobileCollection() {
  const query = '(max-width: 560px)'
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return mobile
}

export function Page({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">Administration</div><h1 ref={heading} tabIndex={-1}>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</div>
}

export function ErrorBanner({ error, retry, retryLabel = 'Retry' }: { error: unknown; retry?: () => void; retryLabel?: string }) {
  return <div className="error-banner" role="alert"><span>{error instanceof Error ? error.message : 'Request failed'}</span>{retry && <button onClick={retry}><RefreshCw size={15} /> {retryLabel}</button>}</div>
}

export function RefreshButton({ pending, refresh }: { pending: boolean; refresh: () => void }) {
  return <button className="icon-button" aria-label="Refresh" title="Refresh" disabled={pending} onClick={refresh}><RefreshCw size={17} className={pending ? 'refreshing' : ''} /></button>
}

export function EmptyState({ loading = false }: { loading?: boolean }) {
  return <div className="empty-state" role="status"><Box size={22} /><strong>{loading ? 'Loading...' : 'No records'}</strong></div>
}

const DialogFlowContext = createContext(false)

export function DialogFlow({ children, fallbackFocus }: { children: ReactNode; fallbackFocus: RefObject<HTMLElement | null> }) {
  const trigger = useRef(document.activeElement)
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    clearTimeout(restoreTimer.current)
    const opener = trigger.current
    const fallback = fallbackFocus.current
    return () => { restoreTimer.current = setTimeout(() => {
      const target = opener instanceof HTMLElement && opener.isConnected ? opener : fallback
      target?.focus({ preventScroll: true })
    }, 0) }
  }, [fallbackFocus])
  return <DialogFlowContext.Provider value>{children}</DialogFlowContext.Provider>
}

export function Modal({ title, description, onClose, children, pending = false, wide = false, dirty = false, actions }: { title: string; description: string; onClose: () => void; children: ReactNode; pending?: boolean; wide?: boolean; dirty?: boolean; actions?: ReactNode }) {
  const trigger = useRef(typeof document === 'undefined' ? null : document.activeElement)
  const flow = useContext(DialogFlowContext)
  const heading = useRef<HTMLHeadingElement>(null)
  const [discard, setDiscard] = useState(false)
  function requestClose() {
    if (pending) return
    if (dirty) setDiscard(true)
    else onClose()
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) requestClose() }}><Dialog.Content maxWidth={wide ? '900px' : '520px'} className={`control-dialog${wide ? ' control-dialog-wide' : ''}`} onOpenAutoFocus={wide ? event => { event.preventDefault(); heading.current?.focus() } : undefined} onCloseAutoFocus={event => {
    event.preventDefault()
    if (flow) return
    const nextDialog = document.querySelector('[role="dialog"], [role="alertdialog"]')
    if (nextDialog) (nextDialog.querySelector('button:not(:disabled), input:not(:disabled)') as HTMLElement | null)?.focus()
    else if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus()
  }}><div className="dialog-header"><div className="dialog-heading"><Dialog.Title ref={heading} tabIndex={-1}>{title}</Dialog.Title><button className="icon-button" type="button" aria-label="Close dialog" disabled={pending} onClick={requestClose}><X size={18} /></button></div><Dialog.Description>{description}</Dialog.Description>{actions && <div className="dialog-toolbar">{actions}</div>}{discard && <div className="dialog-discard" role="alert"><p>Discard unsaved changes?</p><button type="button" disabled={pending} onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className="danger" disabled={pending} onClick={onClose}>Discard changes</button></div>}</div>{wide ? <div className="dialog-body">{children}</div> : children}</Dialog.Content></Dialog.Root>
}

export function DestructiveDialog({ title, description, confirmLabel, pending, onClose, onConfirm, children }: { title: string; description: string; confirmLabel: string; pending: boolean; onClose: () => void; onConfirm: () => void; children?: ReactNode }) {
  const trigger = useRef(typeof document === 'undefined' ? null : document.activeElement)
  const flow = useContext(DialogFlowContext)
  return <AlertDialog.Root open onOpenChange={open => { if (!open && !pending) onClose() }}><AlertDialog.Content maxWidth="520px" className="control-dialog" onEscapeKeyDown={event => { event.preventDefault(); if (!pending) onClose() }} onCloseAutoFocus={event => { event.preventDefault(); if (!flow && trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus() }}><AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description>{description}</AlertDialog.Description>{children}<div className="dialog-actions"><AlertDialog.Cancel><button disabled={pending}>Cancel</button></AlertDialog.Cancel><AlertDialog.Action><button className="danger-button" disabled={pending} onClick={event => { event.preventDefault(); onConfirm() }}>{pending ? 'Applying...' : confirmLabel}</button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Root>
}

export function OneTimeSecretDialog({ title, description, acknowledge, acknowledgeLabel = 'I have stored this securely', pending = false, children }: { title: string; description: string; acknowledge: () => void; acknowledgeLabel?: string; pending?: boolean; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null)
  const acknowledgement = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (!pending) acknowledgement.current?.focus() }, [pending])
  const focusCurrentControl = () => { (pending ? content.current : acknowledgement.current)?.focus() }
  return <Dialog.Root open><Dialog.Content ref={content} maxWidth="520px" className="control-dialog" onOpenAutoFocus={event => { event.preventDefault(); focusCurrentControl() }} onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => { event.preventDefault(); event.detail.originalEvent.preventDefault(); focusCurrentControl() }}><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{children}<div className="dialog-actions"><button ref={acknowledgement} className="primary" disabled={pending} onClick={acknowledge}>{pending ? 'Refreshing identities...' : acknowledgeLabel}</button></div></Dialog.Content></Dialog.Root>
}

export type Column<Row> = { label: string; value: (row: Row) => ReactNode }
export function DataTable<Row>({ rows, columns, rowKey, loading = false }: { rows: readonly Row[]; columns: Column<Row>[]; rowKey: (row: Row) => string; loading?: boolean }) {
  const mobile = useMobileCollection()
  if (loading || !rows.length) return <EmptyState loading={loading} />
  if (mobile) return <div className="mobile-records">{rows.map(row => <dl key={rowKey(row)}>{columns.map(column => <div key={column.label}><dt>{column.label}</dt><dd>{column.value(row)}</dd></div>)}</dl>)}</div>
  return <div className="table-wrap" tabIndex={0} aria-label="Scrollable records"><table><thead><tr>{columns.map(column => <th scope="col" key={column.label}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.label}>{column.value(row)}</td>)}</tr>)}</tbody></table></div>
}
