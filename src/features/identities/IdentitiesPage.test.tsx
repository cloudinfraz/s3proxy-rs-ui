// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import type { Schema } from '../../api/control'
import IdentitiesPage from './IdentitiesPage'

vi.mock('@tanstack/react-query', async importOriginal => ({ ...(await importOriginal<typeof import('@tanstack/react-query')>()), useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('react-router', () => ({ useSearchParams: vi.fn() }))
vi.mock('../../api/client', () => ({ api: vi.fn(), ApiError: class extends Error { status = 500 } }))
vi.mock('../../api/query-keys', async importOriginal => ({ ...(await importOriginal<typeof import('../../api/query-keys')>()), invalidateControl: vi.fn() }))
vi.mock('../../components/EphemeralCredentials', () => ({ default: ({ material }: { material: { accessKey: string } }) => <p>created credentials {material.accessKey}</p>, EphemeralCredentials: ({ material }: { material: { accessKey: string } }) => <p>created credentials {material.accessKey}</p> }))
vi.mock('./DirectMappingDetails', () => ({ default: () => <p>direct mapping detail</p> }))
vi.mock('../../components/control', () => ({
  Page: ({ title, action, children }: { title: string; action: ReactNode; children: ReactNode }) => <main><h1>{title}</h1>{action}{children}</main>,
  RefreshButton: ({ refresh }: { refresh: () => void }) => <button onClick={refresh}>Refresh</button>,
  ErrorBanner: ({ error, retry }: { error: Error; retry?: () => void }) => <div role="alert">{error.message}{retry && <button onClick={retry}>Retry</button>}</div>,
  Modal: ({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) => <section role="dialog" aria-label={title}>{children}<button onClick={onClose}>Close dialog</button></section>,
  DestructiveDialog: ({ title, confirmLabel, children, onConfirm }: { title: string; confirmLabel: string; children: ReactNode; onConfirm: () => void }) => <section role="alertdialog" aria-label={title}>{children}<button onClick={onConfirm}>{confirmLabel}</button></section>,
  DataTable: ({ rows, loading, columns }: { rows: unknown[]; loading: boolean; columns: Array<{ label: string; value: (row: never) => ReactNode }> }) => loading ? <p role="status">Loading...</p> : <div>{rows.length ? rows.map((row, index) => <div key={index}>{columns.map(column => <span key={column.label}>{column.value(row as never)}</span>)}</div>) : 'No records'}</div>,
}))

const identity: Schema['IdentityProjection'] = {
  credential_id: '11111111-1111-4111-8111-111111111111', s3_access_key: 'ACCESS_ONE', azure_account: 'accountone',
  access_mode: 'direct', use_managed_identity: true, versioning_enabled: false, default_backend_id: null,
  enabled: true, virtual_bucket_count: 2, policy_attachment_count: 1,
}
const query = (overrides: Record<string, unknown> = {}) => ({ data: undefined, isError: false, isPending: false, isFetching: false, error: null, refetch: vi.fn(), ...overrides })

function mockQueries(identities: ReturnType<typeof query>, backends = query({ data: [] }), capabilities = query()) {
  vi.mocked(useQuery).mockImplementation(options => {
    const key = (options as { queryKey?: readonly unknown[] }).queryKey ?? []
    if (key.includes('backends')) return backends as never
    if (key.includes('capabilities')) return capabilities as never
    return identities as never
  })
}

beforeEach(() => {
  vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(), vi.fn()] as never)
})
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('IdentitiesPage', () => {
  it('renders loading and request errors with retry behavior', () => {
    mockQueries(query({ isPending: true }))
    const { unmount } = render(<IdentitiesPage />)
    expect(screen.getByRole('status').textContent).toBe('Loading...')
    unmount()
    const refetch = vi.fn()
    mockQueries(query({ isError: true, error: new Error('identity load failed'), refetch }))
    render(<IdentitiesPage />)
    expect(screen.getByRole('alert').textContent).toContain('identity load failed')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('renders data, opens details, and deletes the selected identity', async () => {
    mockQueries(query({ data: [identity] }))
    vi.mocked(api).mockResolvedValue(undefined)
    render(<IdentitiesPage />)
    expect(screen.getByText('ACCESS_ONE')).toBeTruthy()
    expect(screen.getByText('2 routes / 1 policies')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View ACCESS_ONE' }))
    expect(screen.getByRole('dialog', { name: 'Identity details' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete ACCESS_ONE' }))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Delete identity' })).getByRole('button', { name: 'Delete ACCESS_ONE' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/credentials/ACCESS_ONE', { method: 'DELETE' }))
  })

  it('creates an identity and reports asynchronous creation failure', async () => {
    mockQueries(query({ data: [] }))
    vi.mocked(api).mockResolvedValueOnce({ s3_access_key: 'NEW_ACCESS', s3_secret_key: 'secret', s3_endpoint: 'https://example.test' })
    const { unmount } = render(<IdentitiesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create identity' }))
    fireEvent.change(screen.getByLabelText('Azure account'), { target: { value: 'newaccount' } })
    fireEvent.submit(within(screen.getByRole('dialog', { name: 'Create S3 identity' })).getByRole('button', { name: 'Create identity' }).closest('form')!)
    expect(await screen.findByText('created credentials NEW_ACCESS')).toBeTruthy()
    unmount()

    mockQueries(query({ data: [] }))
    vi.mocked(api).mockRejectedValueOnce(new Error('offline'))
    render(<IdentitiesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create identity' }))
    fireEvent.change(screen.getByLabelText('Azure account'), { target: { value: 'newaccount' } })
    fireEvent.submit(within(screen.getByRole('dialog', { name: 'Create S3 identity' })).getByRole('button', { name: 'Create identity' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Identity creation failed')
  })
})