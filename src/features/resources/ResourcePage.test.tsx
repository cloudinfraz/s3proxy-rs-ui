// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { fetchResourceRows } from '../../api/resources'
import { invalidateControl } from '../../api/query-keys'
import ResourcePage from './ResourcePage'

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}))
vi.mock('../../api/client', () => ({ api: vi.fn() }))
vi.mock('../../api/resources', () => ({ fetchResourceRows: vi.fn() }))
vi.mock('../../api/query-keys', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/query-keys')>(),
  invalidateControl: vi.fn(() => Promise.resolve()),
}))

const refetch = vi.fn()
let queryState: {
  data?: Array<Record<string, unknown>>
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: typeof refetch
}

beforeEach(() => {
  queryState = { data: [{ id: 'record-id', virtual_bucket_name: 'photos', azure_container: 'photos-container', credential_id: 'identity-id', enabled: true }], isPending: false, isError: false, error: null, refetch }
  vi.mocked(useQuery).mockImplementation(() => queryState as never)
  vi.mocked(api).mockReset()
  vi.mocked(fetchResourceRows).mockReset()
  vi.mocked(invalidateControl).mockClear()
  refetch.mockReset()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ResourcePage', () => {
  it('renders loading, data, and retryable errors', () => {
    queryState = { data: undefined, isPending: true, isError: false, error: null, refetch }
    const view = render(<ResourcePage resourceName="buckets" />)
    expect(screen.getByRole('status').textContent).toContain('Loading...')

    queryState = { ...queryState, data: [{ id: 'record-id', virtual_bucket_name: 'photos', azure_container: 'photos-container', credential_id: 'identity-id', enabled: true }], isPending: false }
    view.rerender(<ResourcePage resourceName="buckets" />)
    expect(screen.getByText('photos-container')).toBeTruthy()

    queryState = { data: undefined, isPending: false, isError: true, error: new Error('list failed'), refetch }
    view.rerender(<ResourcePage resourceName="buckets" />)
    expect(screen.getByRole('alert').textContent).toContain('list failed')
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('creates a credential with configured defaults and closes the form', async () => {
    queryState.data = []
    vi.mocked(api).mockResolvedValue(undefined)
    render(<ResourcePage resourceName="credentials" />)

    fireEvent.click(screen.getByRole('button', { name: /add s3 identities/i }))
    fireEvent.change(screen.getByLabelText('S3 access key'), { target: { value: 'access-key' } })
    fireEvent.change(screen.getByLabelText('S3 secret key'), { target: { value: 'secret-key' } })
    fireEvent.change(screen.getByLabelText('Azure account'), { target: { value: 'storageaccount' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/credentials', {
      method: 'POST',
      body: JSON.stringify({ use_managed_identity: true, access_mode: 'direct', versioning_enabled: false, s3_access_key: 'access-key', s3_secret_key: 'secret-key', azure_account: 'storageaccount' }),
    }))
    expect(invalidateControl).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('validates policy JSON locally and reports a rejected create', async () => {
    queryState.data = []
    render(<ResourcePage resourceName="policies" />)

    fireEvent.click(screen.getByRole('button', { name: /add policies/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'read-only' } })
    fireEvent.change(screen.getByLabelText('Policy document'), { target: { value: '{invalid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toContain('Policy document must be valid JSON')
    expect(api).not.toHaveBeenCalled()

    vi.mocked(api).mockRejectedValue(new Error('network'))
    fireEvent.change(screen.getByLabelText('Policy document'), { target: { value: '{"Version":"2012-10-17","Statement":[]}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Create failed. Check the values and retry.'))
    expect(screen.getByRole('dialog', { name: 'Add policies' })).toBeTruthy()
  })

  it('rejects an invalid bucket alias without calling the API', () => {
    queryState.data = []
    render(<ResourcePage resourceName="buckets" />)

    fireEvent.click(screen.getByRole('button', { name: /add bucket routing/i }))
    fireEvent.change(screen.getByLabelText('S3 bucket'), { target: { value: 'Bad_Alias' } })
    fireEvent.change(screen.getByLabelText('Azure container'), { target: { value: 'valid-container' } })
    fireEvent.change(screen.getByLabelText('Credential ID'), { target: { value: 'identity-id' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert').textContent).toContain('lowercase')
    expect(api).not.toHaveBeenCalled()
  })

  it('reports a failed delete and closes after a successful retry', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined)
    render(<ResourcePage resourceName="buckets" />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete record' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete record-id' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Delete failed. Retry after checking the resource.')

    fireEvent.click(screen.getByRole('button', { name: 'Delete record-id' }))
    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/admin/virtual-buckets/record-id', { method: 'DELETE' }))
    expect(invalidateControl).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })
})