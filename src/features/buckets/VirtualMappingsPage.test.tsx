// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { ApiError, api } from '../../api/client'
import type { Schema } from '../../api/control'
import { invalidateControl } from '../../api/query-keys'
import VirtualMappingsPage from './VirtualMappingsPage'

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

const summary: Schema['VirtualMappingSummary'] = {
  id: 'mapping-id',
  virtual_bucket_name: 'photos',
  azure_container: 'photos-container',
  credential_id: 'identity-id',
  backend_id: null,
  endpoint_prefix: null,
  enabled: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}
const mapping: Schema['AdminVirtualMapping'] = {
  ...summary,
  credential_default_backend_id: null,
  impact_token: 'impact-token',
}
const identity: Schema['IdentityProjection'] = {
  credential_id: 'identity-id',
  s3_access_key: 'virtual-owner',
  azure_account: 'legacyaccount',
  access_mode: 'virtual',
  use_managed_identity: true,
  versioning_enabled: false,
  default_backend_id: null,
  enabled: true,
  virtual_bucket_count: 1,
  policy_attachment_count: 2,
}
const backend: Schema['StorageBackendProjection'] = {
  id: 'backend-id',
  name: 'archive',
  azure_account: 'archiveaccount',
  auth_mode: 'managed_identity',
  managed_identity_client_id: null,
  user_delegation_sas_enabled: true,
  has_secret_ref: false,
  region_label: null,
  enabled: true,
  credential_default_count: 0,
  virtual_bucket_count: 0,
  impact_token: 'backend-impact',
}
const capabilities: Schema['ControlCapabilities'] = {
  plane: 'control', authz_mode: 'enforce', sts_enabled: true, iam_assume_role_enabled: true,
  assume_role_ready: true, iam_account_configured: true, backend_routing_enabled: true,
  usable_registry_auth_modes: ['managed_identity'], legacy_routing_available: true,
  public_sts_endpoint: null, public_s3_endpoint: null,
}

function state<T>(data?: T, overrides: Partial<QueryState<T>> = {}): QueryState<T> {
  return { data, isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn(), ...overrides }
}

function renderPage(initialEntry = '/buckets') {
  return render(<VirtualMappingsPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter> })
}

let mappingsQuery: QueryState<Schema['VirtualMappingPage']>
let identitiesQuery: QueryState<Schema['IdentityProjection'][]>
let backendsQuery: QueryState<Schema['StorageBackendProjection'][]>
let capabilitiesQuery: QueryState<Schema['ControlCapabilities']>

beforeEach(() => {
  mappingsQuery = state({ items: [summary], next_after_id: 'next-id' })
  identitiesQuery = state([identity])
  backendsQuery = state([backend])
  capabilitiesQuery = state(capabilities)
  vi.mocked(api).mockReset()
  vi.mocked(invalidateControl).mockClear()
  vi.mocked(useQuery).mockImplementation(options => {
    const key = (options as { queryKey: readonly unknown[] }).queryKey
    if (key[1] === 'buckets') return mappingsQuery as never
    if (key[1] === 'identities') return identitiesQuery as never
    if (key[1] === 'backends') return backendsQuery as never
    return capabilitiesQuery as never
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

describe('VirtualMappingsPage', () => {
  it('renders loading, retryable error, data, and pagination states', () => {
    mappingsQuery = state(undefined, { isPending: true })
    const view = renderPage()
    expect(screen.getByRole('status').textContent).toContain('Loading...')

    mappingsQuery = state(undefined, { isError: true, error: new Error('mapping list failed') })
    view.rerender(<VirtualMappingsPage />)
    expect(screen.getByRole('alert').textContent).toContain('mapping list failed')
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(mappingsQuery.refetch).toHaveBeenCalledOnce()

    mappingsQuery = state({ items: [summary], next_after_id: 'next-id' })
    view.rerender(<VirtualMappingsPage />)
    expect(screen.getByText('virtual-owner')).toBeTruthy()
    expect(screen.getByText('Page 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Page 2')).toBeTruthy()
  })

  it('loads and presents authoritative mapping details', async () => {
    vi.mocked(api).mockResolvedValue(mapping)
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'View photos' }))
    const dialog = await screen.findByRole('dialog', { name: 'Mapping details' })
    expect(api).toHaveBeenCalledWith('/admin/ui/virtual-buckets/mapping-id')
    expect(within(dialog).getByText('mapping-id')).toBeTruthy()
    expect(within(dialog).getByText('Legacy account: legacyaccount / photos-container')).toBeTruthy()
  })

  it('reviews and creates a mapping with a reviewed backend revision', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ id: 'backend-id', azure_account: 'archiveaccount', auth_mode: 'managed_identity', enabled: true, revision: 7 })
      .mockResolvedValueOnce(mapping)
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /add bucket routing/i }))
    fireEvent.change(screen.getByLabelText('S3 bucket'), { target: { value: 'new-photos' } })
    fireEvent.change(screen.getByLabelText('Azure container'), { target: { value: 'new-container' } })
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: 'identity-id' } })
    fireEvent.change(screen.getByLabelText('Backend override'), { target: { value: 'backend-id' } })
    fireEvent.change(screen.getByLabelText('Endpoint prefix'), { target: { value: 'media' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))

    expect(await screen.findByRole('dialog', { name: 'Confirm mapping change' })).toBeTruthy()
    expect(api).toHaveBeenNthCalledWith(1, '/admin/ui/mapping-backends/backend-id')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() => expect(api).toHaveBeenNthCalledWith(2, '/admin/ui/virtual-buckets', {
      method: 'POST',
      body: JSON.stringify({ virtual_bucket_name: 'new-photos', azure_container: 'new-container', credential_id: 'identity-id', backend_id: 'backend-id', endpoint_prefix: 'media', expected_backend_revision: 7 }),
    }))
    expect(invalidateControl).toHaveBeenCalledOnce()
  })

  it('keeps the form open when backend review fails', async () => {
    vi.mocked(api).mockRejectedValue(new Error('backend review unavailable'))
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /add bucket routing/i }))
    fireEvent.change(screen.getByLabelText('S3 bucket'), { target: { value: 'new-photos' } })
    fireEvent.change(screen.getByLabelText('Azure container'), { target: { value: 'new-container' } })
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: 'identity-id' } })
    fireEvent.change(screen.getByLabelText('Backend override'), { target: { value: 'backend-id' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))

    expect((await screen.findByRole('alert')).textContent).toContain('backend review unavailable')
    expect(screen.getByRole('dialog', { name: 'Add bucket routing' })).toBeTruthy()
  })

  it('reviews an edit and sends only changed mapping fields', async () => {
    vi.mocked(api).mockResolvedValueOnce(mapping).mockResolvedValueOnce(mapping)
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit photos' }))
    await screen.findByDisplayValue('photos-container')
    fireEvent.change(screen.getByLabelText('Azure container'), { target: { value: 'updated-container' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    expect(await screen.findByRole('dialog', { name: 'Confirm mapping change' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))

    await waitFor(() => expect(api).toHaveBeenNthCalledWith(2, '/admin/ui/virtual-buckets/mapping-id', {
      method: 'PUT',
      body: JSON.stringify({ expected_impact_token: 'impact-token', azure_container: 'updated-container' }),
    }))
  })

  it('reports a stale delete and succeeds after reopening the authoritative record', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(mapping)
      .mockRejectedValueOnce(new ApiError(409, 'resource changed'))
      .mockResolvedValueOnce(mapping)
      .mockResolvedValueOnce(undefined)
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Remove photos' }))
    await screen.findByRole('alertdialog', { name: 'Remove bucket routing' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove photos' }))
    expect((await screen.findByRole('alert')).textContent).toContain('resource changed')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove photos' }))
    await screen.findByRole('alertdialog', { name: 'Remove bucket routing' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove photos' }))
    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/admin/ui/virtual-buckets/mapping-id', {
      method: 'DELETE', body: JSON.stringify({ expected_impact_token: 'impact-token' }),
    }))
    expect(invalidateControl).toHaveBeenCalledOnce()
  })

  it('preselects an enabled virtual identity from a safe mapping handoff', async () => {
    const credentialId = '22222222-2222-4222-8222-222222222222'
    identitiesQuery = state([{ ...identity, credential_id: credentialId }])
    renderPage(`/buckets?create=mapping&identity=${credentialId}`)

    const dialog = await screen.findByRole('dialog', { name: 'Add bucket routing' })
    expect(within(dialog).getByLabelText('Identity')).toHaveProperty('value', credentialId)
    expect(screen.getByRole('link', { name: 'Create virtual identity', hidden: true }).getAttribute('href')).toBe('/credentials?create=virtual&return=buckets')
  })

  it('opens a recoverable mapping form when a credential handoff is invalid', async () => {
    renderPage('/buckets?create=mapping&identity=not-a-uuid')

    const dialog = await screen.findByRole('dialog', { name: 'Add bucket routing' })
    expect(within(dialog).getByRole('alert').textContent).toContain('Select an enabled virtual identity')
    expect(within(dialog).getByLabelText('Identity')).toHaveProperty('value', '')
  })
})