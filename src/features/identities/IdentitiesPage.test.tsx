// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import type { Schema } from '../../api/control'
import IdentitiesPage from './IdentitiesPage'

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn(), setSearchParams: vi.fn() }))

vi.mock('@tanstack/react-query', async importOriginal => ({ ...(await importOriginal<typeof import('@tanstack/react-query')>()), useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('react-router', () => ({ useNavigate: () => routerMocks.navigate, useSearchParams: vi.fn() }))
vi.mock('../../api/client', () => ({ api: vi.fn(), ApiError: class extends Error { status = 500 } }))
vi.mock('../../api/query-keys', async importOriginal => ({ ...(await importOriginal<typeof import('../../api/query-keys')>()), invalidateControl: vi.fn() }))
vi.mock('../../components/EphemeralCredentials', () => ({ EphemeralCredentials: ({ material, dismiss, acknowledgeLabel = 'I have stored this securely' }: { material: { accessKey: string; secretKey: string }; dismiss: () => void; acknowledgeLabel?: string }) => <div><p>created credentials {material.accessKey} {material.secretKey}</p><button onClick={dismiss}>{acknowledgeLabel}</button></div> }))
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
  vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(), routerMocks.setSearchParams] as never)
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
    vi.mocked(api).mockResolvedValueOnce({ credential_id: '22222222-2222-4222-8222-222222222222', s3_access_key: 'NEW_ACCESS', s3_secret_key: 'secret', s3_endpoint: 'https://example.test', azure_account: 'newaccount', access_mode: 'direct', use_managed_identity: true, default_backend_id: null })
    const { unmount } = render(<IdentitiesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create identity' }))
    fireEvent.change(screen.getByLabelText('Azure account'), { target: { value: 'newaccount' } })
    fireEvent.submit(within(screen.getByRole('dialog', { name: 'Create S3 identity' })).getByRole('button', { name: 'Create identity' }).closest('form')!)
    expect(await screen.findByText(/created credentials\s+NEW_ACCESS/)).toBeTruthy()
    unmount()

    mockQueries(query({ data: [] }))
    vi.mocked(api).mockRejectedValueOnce(new Error('offline'))
    render(<IdentitiesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create identity' }))
    fireEvent.change(screen.getByLabelText('Azure account'), { target: { value: 'newaccount' } })
    fireEvent.submit(within(screen.getByRole('dialog', { name: 'Create S3 identity' })).getByRole('button', { name: 'Create identity' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Identity creation failed')
  })

  it('creates a server-generated virtual identity and continues to mapping creation after acknowledgement', async () => {
    const credentialId = '22222222-2222-4222-8222-222222222222'
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams('create=virtual&return=buckets'), routerMocks.setSearchParams] as never)
    mockQueries(query({ data: [] }))
    vi.mocked(api).mockResolvedValueOnce({ credential_id: credentialId, s3_access_key: 'GENERATED_ACCESS', s3_secret_key: 'generated-secret', s3_endpoint: 'https://example.test', azure_account: 'newaccount', access_mode: 'virtual', use_managed_identity: true, default_backend_id: null })
    render(<IdentitiesPage />)

    const dialog = await screen.findByRole('dialog', { name: 'Create S3 identity' })
    expect(within(dialog).getByLabelText('Mode')).toHaveProperty('value', 'virtual')
    fireEvent.change(within(dialog).getByLabelText('Azure account'), { target: { value: 'newaccount' } })
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Create identity' }).closest('form')!)

    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/credentials', {
      method: 'POST',
      body: JSON.stringify({ s3_access_key: '', s3_secret_key: '', azure_account: 'newaccount', use_managed_identity: true, access_mode: 'virtual', versioning_enabled: false, default_backend_id: null }),
    }))
    expect(await screen.findByText(/generated-secret/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'I stored these securely; continue' }))
    expect(screen.queryByText(/generated-secret/)).toBeNull()
    expect(routerMocks.navigate).toHaveBeenCalledWith(`/buckets?create=mapping&identity=${credentialId}`)
  })

  it('clears the mapping continuation when virtual identity creation is cancelled', async () => {
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams('create=virtual&return=buckets'), routerMocks.setSearchParams] as never)
    mockQueries(query({ data: [] }))
    render(<IdentitiesPage />)

    await screen.findByRole('dialog', { name: 'Create S3 identity' })
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create identity' }))
    expect(screen.getByLabelText('Mode')).toHaveProperty('value', 'direct')
  })
})