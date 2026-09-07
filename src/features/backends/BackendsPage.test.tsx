// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../../api/client'
import type { Schema } from '../../api/control'
import { invalidateControl } from '../../api/query-keys'
import BackendsPage from './BackendsPage'

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}))
vi.mock('../../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  api: vi.fn(),
}))
vi.mock('../../api/query-keys', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/query-keys')>(),
  invalidateControl: vi.fn(() => Promise.resolve()),
}))

type QueryState<T> = {
  data: T | undefined
  isPending: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refetch: ReturnType<typeof vi.fn>
}

const backend: Schema['StorageBackendProjection'] = {
  id: 'backend-id',
  name: 'archive',
  azure_account: 'archiveaccount',
  auth_mode: 'managed_identity',
  managed_identity_client_id: null,
  user_delegation_sas_enabled: true,
  has_secret_ref: false,
  region_label: 'east',
  enabled: true,
  credential_default_count: 2,
  virtual_bucket_count: 3,
  impact_token: 'impact-token',
}
const capabilities: Schema['ControlCapabilities'] = {
  plane: 'control',
  authz_mode: 'enforce',
  sts_enabled: true,
  iam_assume_role_enabled: true,
  assume_role_ready: true,
  iam_account_configured: true,
  backend_routing_enabled: true,
  usable_registry_auth_modes: ['managed_identity', 'account_key'],
  legacy_routing_available: true,
  public_sts_endpoint: null,
  public_s3_endpoint: null,
}

function state<T>(data?: T, overrides: Partial<QueryState<T>> = {}): QueryState<T> {
  return { data, isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn(), ...overrides }
}

let backendsQuery: QueryState<Schema['StorageBackendProjection'][]>
let capabilitiesQuery: QueryState<Schema['ControlCapabilities']>

beforeEach(() => {
  vi.mocked(api).mockReset()
  vi.mocked(invalidateControl).mockClear()
  backendsQuery = state([backend])
  capabilitiesQuery = state(capabilities)
  vi.mocked(useQuery).mockImplementation(options => {
    const key = (options as { queryKey: readonly unknown[] }).queryKey
    return (key[1] === 'backends' ? backendsQuery : capabilitiesQuery) as never
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BackendsPage', () => {
  it('renders loading, empty, and error query states', () => {
    backendsQuery = { data: undefined, isPending: true, isFetching: false, isError: false, error: null, refetch: vi.fn() }
    const view = render(<BackendsPage />)
    expect(screen.getByRole('status').textContent).toContain('Loading...')

    backendsQuery = state([])
    view.rerender(<BackendsPage />)
    expect(screen.getByRole('status').textContent).toContain('No records')

    backendsQuery = { data: undefined, isPending: false, isFetching: false, isError: true, error: new Error('backend list unavailable'), refetch: vi.fn() }
    view.rerender(<BackendsPage />)
    expect(screen.getByRole('alert').textContent).toContain('backend list unavailable')
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(backendsQuery.refetch).toHaveBeenCalledOnce()
  })

  it('renders backend rows and opens authoritative detail content', () => {
    render(<BackendsPage />)

    expect(screen.getByText('archiveaccount')).toBeTruthy()
    expect(screen.getByText('2 identities / 3 mappings')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View archive' }))
    const dialog = screen.getByRole('dialog', { name: 'Backend details' })
    expect(within(dialog).getByText('System / workload identity')).toBeTruthy()
  })

  it('creates a backend, invalidates queries, and closes the form', async () => {
    vi.mocked(api).mockResolvedValue({})
    render(<BackendsPage />)

    fireEvent.click(screen.getByRole('button', { name: /register backend/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'new-backend' } })
    fireEvent.change(screen.getByLabelText('Azure account'), { target: { value: 'newaccount' } })
    fireEvent.change(screen.getByLabelText('Region label'), { target: { value: 'west' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review and save' }))

    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/backends', {
      method: 'POST',
      body: JSON.stringify({ name: 'new-backend', azure_account: 'newaccount', auth_mode: 'managed_identity', managed_identity_client_id: null, user_delegation_sas_enabled: true, secret_ref: null, region_label: 'west', enabled: true }),
    }))
    expect(invalidateControl).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the create form open and reports API failures', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(503, 'temporarily unavailable'))
    render(<BackendsPage />)

    fireEvent.click(screen.getByRole('button', { name: /register backend/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'new-backend' } })
    fireEvent.change(screen.getByLabelText('Azure account'), { target: { value: 'newaccount' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review and save' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Backend creation failed (HTTP 503): temporarily unavailable')
    expect(screen.getByRole('dialog', { name: 'Register backend' })).toBeTruthy()
  })

  it('requires impact confirmation before updating referenced routing metadata', async () => {
    vi.mocked(api).mockResolvedValue({})
    render(<BackendsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit archive' }))
    fireEvent.change(screen.getByLabelText('Azure account'), { target: { value: 'replacement' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review and save' }))
    expect(screen.getByRole('dialog', { name: 'Confirm routing impact' })).toBeTruthy()
    expect(api).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/backends/archive', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('"expected_impact_token":"impact-token"'),
    })))
  })

  it('reports a failed delete and succeeds when the user retries', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined)
    render(<BackendsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete archive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete archive' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Backend deletion failed')

    fireEvent.click(screen.getByRole('button', { name: 'Delete archive' }))
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
    expect(api).toHaveBeenLastCalledWith('/admin/backends/archive', { method: 'DELETE' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })
})