// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import TemporaryCredentialsPage from './TemporaryCredentialsPage'

const stsMocks = vi.hoisted(() => ({ api: vi.fn(), writeText: vi.fn() }))

vi.mock('../../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/client')>(),
}))
vi.mock('../../api/operations', () => ({ invokeOperation: stsMocks.api }))

const capabilities = {
  plane: 'control',
  authz_mode: 'enforce',
  sts_enabled: true,
  iam_assume_role_enabled: true,
  assume_role_ready: true,
  iam_account_configured: true,
  backend_routing_enabled: true,
  usable_registry_auth_modes: ['access_key'],
  legacy_routing_available: false,
  public_sts_endpoint: 'https://sts.example.test',
  public_s3_endpoint: 'https://s3.example.test',
}

function role(id: string, name: string) {
  return {
    id,
    role_id: `role-id-${id}`,
    account_id: '123456789012',
    role_path: '/service/',
    role_name: name,
    role_arn: `arn:aws:iam::123456789012:role/service/${name}`,
    resource_credential_id: 'credential-1',
    max_session_duration_seconds: 7200,
    enabled: true,
    lifecycle_revision: 1,
    trust_revision: 1,
    attachment_revision: 1,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  }
}

const limits = { min_duration_seconds: 3600, max_duration_seconds: 43200, max_retirement_batch: 1000, retained_count_cap: 1000, default_page_size: 100, max_page_size: 200 }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><TemporaryCredentialsPage /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: stsMocks.writeText } })
  stsMocks.writeText.mockResolvedValue(undefined)
  stsMocks.api.mockImplementation(async (operationId: string, input?: { parameters?: { query?: { after_id?: string } } }) => {
    if (operationId === 'getCapabilities') return capabilities
    if (operationId === 'listAdminRoles' && input?.parameters?.query?.after_id === 'next-page') return { items: [role('role-2', 'Reader')], next_after_id: null, limits }
    if (operationId === 'listAdminRoles') return { items: [role('role-1', 'Writer')], next_after_id: 'next-page', limits }
    throw new Error(`Unexpected API operation: ${operationId}`)
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('TemporaryCredentialsPage interactions', () => {
  it('renders readiness and moves between cursor-based role pages', async () => {
    renderPage()

    expect(await screen.findByText('AssumeRole ready')).toBeTruthy()
    expect(screen.getByText('/service/Writer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next role page' }))
    expect(await screen.findByText('/service/Reader')).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous role page' }))
    expect(await screen.findByText('/service/Writer')).toBeTruthy()
  })

  it('announces clipboard success and failure without hiding the guidance', async () => {
    renderPage()
    const copy = await screen.findByRole('button', { name: 'Copy AWS CLI: issue credentials' })
    fireEvent.click(copy)

    expect(await screen.findByText('AWS CLI: issue credentials copied')).toBeTruthy()
    expect(stsMocks.writeText).toHaveBeenCalledWith(expect.stringContaining('aws sts assume-role'))

    stsMocks.writeText.mockRejectedValueOnce(new Error('clipboard denied'))
    fireEvent.click(copy)
    expect(await screen.findByText('AWS CLI: issue credentials could not be copied')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('https://sts.example.test')).toBeTruthy())
  })
})