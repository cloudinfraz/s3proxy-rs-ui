// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import OverviewPage from './OverviewPage'

const overviewMocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock('../../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  api: overviewMocks.api,
}))

const capabilities = {
  plane: 'control',
  authz_mode: 'enforce',
  sts_enabled: false,
  iam_assume_role_enabled: false,
  assume_role_ready: false,
  iam_account_configured: false,
  backend_routing_enabled: true,
  usable_registry_auth_modes: ['access_key'],
  legacy_routing_available: false,
  public_sts_endpoint: null,
  public_s3_endpoint: null,
}

const health = {
  status: 'healthy',
  version: 'overview-test',
  timestamp: '2026-09-07T00:00:00Z',
  cache: { mode: 'memory', available: true, redis_connected: false },
  credentials: { count: 0 },
  multipart: { store_type: 'memory', redis_available: false, persistence: 'ephemeral', warning: null },
  authorization: { mode: 'enforce', coherence: 'strict', resolver_ready: true, database_ready: true, audit_required: true, audit_dispatcher_ready: true },
}

function emptyResponse(path: string) {
  if (path === '/admin/ui/identities' || path === '/admin/ui/backends' || path === '/admin/policies') return { count: 0, items: [] }
  if (path === '/admin/ui/roles?limit=100') return { items: [], next_after_id: null, limits: { min_duration_seconds: 3600, max_duration_seconds: 43200, max_retirement_batch: 1000, retained_count_cap: 1000, default_page_size: 100, max_page_size: 200 } }
  if (path === '/admin/capabilities') return capabilities
  if (path === '/admin/health') return health
  return []
}

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><OverviewPage /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('OverviewPage interactions', () => {
  it('renders resource counts, clear readiness, and the runtime summary', async () => {
    overviewMocks.api.mockImplementation(async (path: string) => emptyResponse(path))
    renderOverview()

    expect(await screen.findByText('No configuration findings')).toBeTruthy()
    expect(screen.getByText('overview-test')).toBeTruthy()
    for (const label of ['S3 identities', 'Bucket routing', 'Azure backends', 'Policies']) {
      const link = screen.getByRole('link', { name: label })
      expect(link.parentElement?.querySelector('strong')?.textContent).toBe('0')
    }
  })

  it('shows an unavailable count and retries only that failed resource', async () => {
    let identityAttempts = 0
    overviewMocks.api.mockImplementation(async (path: string) => {
      if (path === '/admin/ui/identities' && ++identityAttempts === 1) throw new Error('identity request failed')
      return emptyResponse(path)
    })
    renderOverview()

    expect(await screen.findByText('Unavailable')).toBeTruthy()
    const identityMetric = screen.getByRole('link', { name: 'S3 identities' }).parentElement
    const retry = identityMetric?.querySelector('button')
    if (!(retry instanceof HTMLButtonElement)) throw new Error('Expected the identity retry button')
    fireEvent.click(retry)

    await waitFor(() => expect(identityAttempts).toBe(2))
    await waitFor(() => expect(identityMetric?.querySelector('strong')?.textContent).toBe('0'))
  })
})