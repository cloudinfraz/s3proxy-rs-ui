// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import BucketPolicies from './BucketPolicies'

vi.mock('@tanstack/react-query', async importOriginal => ({ ...(await importOriginal<typeof import('@tanstack/react-query')>()), useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('../../api/client', () => ({ api: vi.fn(), ApiError: class extends Error { status = 409 } }))
vi.mock('../../api/query-keys', async importOriginal => ({ ...(await importOriginal<typeof import('../../api/query-keys')>()), invalidateControl: vi.fn() }))
vi.mock('../../components/control', () => ({
  DialogFlow: ({ children }: { children: ReactNode }) => <>{children}</>,
  RefreshButton: ({ refresh }: { refresh: () => void }) => <button onClick={refresh}>Refresh</button>,
  ErrorBanner: ({ error }: { error: Error }) => <div role="alert">{error.message}</div>,
  Modal: ({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) => <section role="dialog" aria-label={title}>{actions}{children}</section>,
  DestructiveDialog: ({ title, confirmLabel, children, onConfirm }: { title: string; confirmLabel: string; children: ReactNode; onConfirm: () => void }) => <section role="alertdialog" aria-label={title}>{children}<button onClick={onConfirm}>{confirmLabel}</button></section>,
  DataTable: ({ rows, loading, columns }: { rows: unknown[]; loading: boolean; columns: Array<{ label: string; value: (row: never) => ReactNode }> }) => loading ? <p role="status">Loading...</p> : <div>{rows.map((row, index) => <div key={index}>{columns.map(column => <span key={column.label}>{column.value(row as never)}</span>)}</div>)}</div>,
}))

const scope = { kind: 'direct' as const, bucket: 'reports' }
const summary = { scope, revision: 4, updated_at: '2026-01-01T00:00:00Z', review_token: 'review-token' }
const detail = { policy: summary, document: { Version: '2012-10-17', Statement: [] } }
const validation = { valid: true, violations: [], json_bytes: 80, statements: 1, compiled_bytes: 40 }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise }); return { promise, resolve } }
const query = (data?: unknown, overrides: Record<string, unknown> = {}) => ({ data, isError: false, isPending: false, isFetching: false, error: null, refetch: vi.fn(), ...overrides })
function mockQueries(listQuery: ReturnType<typeof query>, detailQuery = query(detail)) {
  vi.mocked(useQuery).mockImplementation(options => ((options as { enabled?: boolean }).enabled === undefined ? listQuery : detailQuery) as never)
}
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('BucketPolicies', () => {
  it('renders loading and list errors', () => {
    mockQueries(query(undefined, { isPending: true }))
    const { unmount } = render(<BucketPolicies />)
    expect(screen.getByRole('status').textContent).toBe('Loading...')
    unmount()
    mockQueries(query(undefined, { isError: true, error: new Error('bucket policies failed') }))
    render(<BucketPolicies />)
    expect(screen.getByRole('alert').textContent).toContain('bucket policies failed')
  })

  it('opens detail and completes a validated edit review', async () => {
    mockQueries(query({ items: [summary], next_after_key: null }))
    vi.mocked(api).mockResolvedValueOnce({ valid: true, violations: [], json_bytes: 40, statements: 0, compiled_bytes: 10 }).mockResolvedValueOnce(detail).mockResolvedValueOnce({ detail })
    render(<BucketPolicies />)
    fireEvent.click(screen.getByRole('button', { name: 'View Direct global bucket: reports' }))
    expect(screen.getByRole('region', { name: 'Bucket policy detail' }).textContent).toContain('"Version": "2012-10-17"')
    expect(screen.getByRole('dialog', { name: 'Direct global bucket: reports' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Edit policy/ }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Bucket policy detail' })).toBeNull()
    fireEvent.submit(within(screen.getByRole('dialog', { name: 'Edit bucket policy' })).getByRole('button', { name: 'Review change' }).closest('form')!)
    expect(await screen.findByText('Compiled bytes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/bucket-policies/direct/reports', expect.objectContaining({ method: 'PUT' })))
  })

  it('reviews and deletes only the selected scope', async () => {
    mockQueries(query({ items: [summary], next_after_key: null }))
    vi.mocked(api).mockResolvedValueOnce(detail).mockResolvedValueOnce({ detail: null })
    render(<BucketPolicies />)
    fireEvent.click(screen.getByRole('button', { name: 'View Direct global bucket: reports' }))
    fireEvent.click(screen.getByRole('button', { name: /Delete policy/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete bucket policy' })).getByRole('button', { name: 'Review change' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete policy for Direct global bucket: reports' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/bucket-policies/direct/reports', expect.objectContaining({ method: 'DELETE' })))
  })

  it('switches to virtual scopes and renders ownership metadata', () => {
    const virtualScope = { kind: 'virtual' as const, bucket: 'reports', bucket_id: 'bucket-id', credential_id: 'credential-id' }
    const virtualSummary = { ...summary, scope: virtualScope }
    const virtualDetail = { ...detail, policy: virtualSummary }
    const directQuery = query({ items: [summary], next_after_key: null })
    const virtualQuery = query({ items: [virtualSummary], next_after_key: null })
    vi.mocked(useQuery).mockImplementation(options => {
      if ((options as { enabled?: boolean }).enabled !== undefined) return query(virtualDetail) as never
      return (JSON.stringify((options as { queryKey: unknown }).queryKey).includes('virtual') ? virtualQuery : directQuery) as never
    })
    render(<BucketPolicies />)

    expect(screen.getByRole('button', { name: 'View Direct global bucket: reports' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Virtual scoped' }))
    expect(screen.queryByRole('button', { name: 'View Direct global bucket: reports' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View Virtual bucket: reports (bucket-id)' }))
    const policyDetail = screen.getByRole('region', { name: 'Bucket policy detail' })
    expect(policyDetail.textContent).toContain('credential-id')
    expect(policyDetail.textContent).toContain('bucket-id')
  })

  it('shows policy validation findings without opening confirmation', async () => {
    mockQueries(query({ items: [summary], next_after_key: null }))
    vi.mocked(api).mockResolvedValueOnce({ valid: false, violations: [{ code: 'invalid_resource', field: 'Statement[0].Resource', message: 'Resource is outside the bucket' }], json_bytes: 80, statements: 1, compiled_bytes: 0 })
    render(<BucketPolicies />)
    fireEvent.click(screen.getByRole('button', { name: 'View Direct global bucket: reports' }))
    fireEvent.click(screen.getByRole('button', { name: /Edit policy/ }))
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Resolve server validation findings'))
    expect(screen.getByText(/Resource is outside the bucket/)).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Confirm: edit bucket policy' })).toBeNull()
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('requests the selected scope before server pagination', async () => {
    vi.mocked(useQuery).mockImplementation(options => {
      const queryOptions = options as unknown as { enabled?: boolean; queryFn: () => Promise<unknown> }
      if (queryOptions.enabled !== undefined) return query(detail) as never
      void queryOptions.queryFn()
      return query({ items: [], next_after_key: null }) as never
    })
    vi.mocked(api).mockResolvedValue({ items: [], next_after_key: null })
    render(<BucketPolicies />)
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/bucket-policies?limit=100&scope_kind=direct'))
    fireEvent.click(screen.getByRole('button', { name: 'Virtual scoped' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/bucket-policies?limit=100&scope_kind=virtual'))
  })

  it('keeps next and previous cursors inside their selected scope', async () => {
    vi.mocked(useQuery).mockImplementation(options => {
      const queryOptions = options as unknown as { enabled?: boolean; queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }
      if (queryOptions.enabled !== undefined) return query(detail) as never
      void queryOptions.queryFn()
      const cursor = queryOptions.queryKey.at(-1) as { kind: string; afterKey: string | null }
      return query({ items: [], next_after_key: cursor.kind === 'direct' && cursor.afterKey === null ? 'direct-cursor' : null }) as never
    })
    vi.mocked(api).mockResolvedValue({ items: [], next_after_key: null })
    render(<BucketPolicies />)
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/bucket-policies?limit=100&scope_kind=direct'))

    fireEvent.click(screen.getByRole('button', { name: 'Next bucket policy page' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/bucket-policies?limit=100&scope_kind=direct&after_key=direct-cursor'))
    fireEvent.click(screen.getByRole('button', { name: 'Previous bucket policy page' }))
    await waitFor(() => expect(vi.mocked(api).mock.calls.filter(([url]) => url === '/admin/ui/bucket-policies?limit=100&scope_kind=direct')).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: 'Next bucket policy page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Virtual scoped' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/bucket-policies?limit=100&scope_kind=virtual'))
    expect(vi.mocked(api).mock.calls.some(([url]) => String(url).includes('scope_kind=virtual&after_key='))).toBe(false)
  })

  it('requires revalidation after a bucket policy changes during validation', async () => {
    const staleValidation = deferred<typeof validation>()
    mockQueries(query({ items: [summary], next_after_key: null }))
    vi.mocked(api)
      .mockReturnValueOnce(staleValidation.promise)
      .mockResolvedValueOnce(validation)
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce({ detail })
    render(<BucketPolicies />)
    fireEvent.click(screen.getByRole('button', { name: 'View Direct global bucket: reports' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit policy' }))
    const editor = screen.getByLabelText('Policy document')
    fireEvent.change(editor, { target: { value: JSON.stringify({ Version: '2012-10-17', Statement: [{ Action: 's3:GetObject' }] }) } })
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    fireEvent.change(editor, { target: { value: JSON.stringify({ Version: '2012-10-17', Statement: [{ Action: 's3:DeleteObject' }] }) } })
    staleValidation.resolve(validation)

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirm: edit bucket policy' })).toBeNull())
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm change' }))

    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/admin/ui/bucket-policies/direct/reports', expect.objectContaining({
      body: expect.stringContaining('s3:DeleteObject'),
    })))
    expect(vi.mocked(api).mock.calls.at(-1)?.[1]?.body).not.toContain('s3:GetObject')
  })
})