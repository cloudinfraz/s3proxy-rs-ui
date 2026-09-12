// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import ManagedPolicies from './ManagedPolicies'

vi.mock('../../api/client', () => ({ api: vi.fn(), ApiError: class extends Error { status = 409 } }))
vi.mock('../../api/query-keys', async importOriginal => ({ ...(await importOriginal<typeof import('../../api/query-keys')>()), invalidateControl: vi.fn() }))
vi.mock('../../components/control', () => ({
  DialogFlow: ({ children }: { children: ReactNode }) => <>{children}</>,
  RefreshButton: ({ refresh }: { refresh: () => void }) => <button onClick={refresh}>Refresh</button>,
  ErrorBanner: ({ error, retry }: { error: Error; retry?: () => void }) => <div role="alert">{error.message}{retry && <button onClick={retry}>Retry</button>}</div>,
  Modal: ({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) => <section role="dialog" aria-label={title}>{actions}{children}</section>,
  DestructiveDialog: ({ title, confirmLabel, children, onConfirm }: { title: string; confirmLabel: string; children: ReactNode; onConfirm: () => void }) => <section role="alertdialog" aria-label={title}>{children}<button onClick={onConfirm}>{confirmLabel}</button></section>,
  DataTable: ({ rows, loading, columns }: { rows: unknown[]; loading: boolean; columns: Array<{ label: string; value: (row: never) => ReactNode }> }) => loading ? <p role="status">Loading...</p> : <div>{rows.map((row, index) => <div key={index}>{columns.map(column => <span key={column.label}>{column.value(row as never)}</span>)}</div>)}</div>,
}))

const summary = { id: 'policy-id', name: 'ReadOnly', description: 'read access', revision: 2, built_in: false, deletable: true, credential_attachment_count: 1, role_attachment_count: 0, updated_at: '2026-01-01T00:00:00Z' }
const detail = { policy: summary, document: { Version: '2012-10-17', Statement: [] }, impact_token: 'impact' }
const validation = { valid: true, violations: [], json_bytes: 80, statements: 1, compiled_bytes: 40 }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise }); return { promise, resolve } }
function renderView() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><ManagedPolicies /></QueryClientProvider>) }
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('ManagedPolicies', () => {
  it('renders loading and list failures', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(api).mockReturnValueOnce(new Promise(value => { resolve = value }))
    renderView()
    expect(screen.getByRole('status').textContent).toBe('Loading...')
    resolve({ items: [], next_after_id: null, max_page_size: 100 })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    cleanup()
    vi.mocked(api).mockRejectedValueOnce(new Error('policy list failed'))
    renderView()
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('policy list failed'))
  })

  it('loads detail and completes reviewed deletion', async () => {
    vi.mocked(api).mockImplementation(async url => url === '/admin/ui/policies?limit=100' ? { items: [summary], next_after_id: null, max_page_size: 100 } : url === '/admin/ui/policies/policy-id' ? detail : { detail: null })
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'View ReadOnly' }))
    expect(await screen.findByText('read access')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'ReadOnly' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Delete policy/ }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Managed policy detail' })).toBeNull()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete ReadOnly' })).getByRole('button', { name: 'Review change' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete ReadOnly' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/policies/policy-id', expect.objectContaining({ method: 'DELETE' })))
  })

  it('validates and creates a policy through the review step', async () => {
    vi.mocked(api).mockImplementation(async (url, options) => {
      if (url === '/admin/ui/policies?limit=100') return { items: [], next_after_id: null, max_page_size: 100 }
      if (url === '/admin/ui/policies/validate') return { valid: true, violations: [], json_bytes: 40, statements: 0, compiled_bytes: 10 }
      if (url === '/admin/ui/policies' && options?.method === 'POST') return detail
      throw new Error('unexpected request')
    })
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: /Create policy/ }))
    fireEvent.change(screen.getByLabelText('Policy name'), { target: { value: 'ReadOnly' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    expect(await screen.findByText('Validated bytes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/policies', expect.objectContaining({ method: 'POST' })))
  })

  it('shows server validation findings and keeps the draft in edit mode', async () => {
    vi.mocked(api).mockImplementation(async url => {
      if (url === '/admin/ui/policies?limit=100') return { items: [], next_after_id: null, max_page_size: 100 }
      if (url === '/admin/ui/policies/validate') return { valid: false, violations: [{ code: 'invalid_action', field: 'Statement[0].Action', message: 'Unsupported action' }], json_bytes: 40, statements: 1, compiled_bytes: 0 }
      throw new Error('unexpected request')
    })
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: /Create policy/ }))
    fireEvent.change(screen.getByLabelText('Policy name'), { target: { value: 'InvalidPolicy' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Resolve the server validation findings'))
    expect(screen.getByText(/Unsupported action/)).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Create managed policy' })).toBeTruthy()
    expect(api).toHaveBeenCalledTimes(2)
  })

  it('requires revalidation after a managed create draft changes during validation', async () => {
    const staleValidation = deferred<typeof validation>()
    vi.mocked(api)
      .mockResolvedValueOnce({ items: [], next_after_id: null, max_page_size: 100 })
      .mockReturnValueOnce(staleValidation.promise)
      .mockResolvedValueOnce(validation)
      .mockResolvedValueOnce(detail)
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: /Create policy/ }))
    fireEvent.change(screen.getByLabelText('Policy name'), { target: { value: 'ReadOnly' } })
    const editor = screen.getByLabelText('Policy document')
    fireEvent.change(editor, { target: { value: JSON.stringify({ Version: '2012-10-17', Statement: [{ Action: 's3:GetObject' }] }) } })
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    fireEvent.change(editor, { target: { value: JSON.stringify({ Version: '2012-10-17', Statement: [{ Action: 's3:DeleteObject' }] }) } })
    staleValidation.resolve(validation)

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirm: Create managed policy' })).toBeNull())
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm change' }))

    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/admin/ui/policies', expect.objectContaining({
      body: expect.stringContaining('s3:DeleteObject'),
    })))
    expect(vi.mocked(api).mock.calls.at(-1)?.[1]?.body).not.toContain('s3:GetObject')
  })

  it('discards a delayed managed edit validation after the document changes', async () => {
    const staleValidation = deferred<typeof validation>()
    vi.mocked(api)
      .mockResolvedValueOnce({ items: [summary], next_after_id: null, max_page_size: 100 })
      .mockResolvedValueOnce(detail)
      .mockReturnValueOnce(staleValidation.promise)
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'View ReadOnly' }))
    await screen.findByText('read access')
    fireEvent.click(screen.getByRole('button', { name: 'Edit policy' }))
    const editor = screen.getByLabelText('Policy document')
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    fireEvent.change(editor, { target: { value: JSON.stringify({ Version: '2012-10-17', Statement: [{ Action: 's3:DeleteObject' }] }) } })
    staleValidation.resolve(validation)

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirm: Edit ReadOnly' })).toBeNull())
    expect(api).toHaveBeenCalledTimes(3)
  })
})