// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import OverviewPage from './OverviewPage'

const overviewMocks = vi.hoisted(() => ({ invokeOperation: vi.fn() }))

vi.mock('../../api/operations', () => ({ invokeOperation: overviewMocks.invokeOperation }))

const health = {
  status: 'healthy',
  version: 'overview-test',
  timestamp: '2026-09-07T00:00:00Z',
  cache: { mode: 'memory', available: true, redis_connected: false },
  credentials: { count: 0 },
  multipart: { store_type: 'memory', redis_available: false, persistence: 'ephemeral', warning: null },
  authorization: { mode: 'enforce', coherence: 'strict', resolver_ready: true, database_ready: true, audit_required: true, audit_dispatcher_ready: true },
}

const ready = {
  evaluated_at: '2026-09-12T00:00:00Z', status: 'ready', finding_count: 0, items: [],
  next_after_key: null, default_page_size: 20, max_page_size: 100,
}
const attention = {
  ...ready, status: 'attention', finding_count: 1,
  items: [{ key: '0123456789abcdef0123456789abcdef', code: 'mapping_owner_disabled', severity: 'warning', resource_kind: 'virtual_bucket', resource_id: '11111111-1111-4111-8111-111111111111', display_name: 'reports', affected_count: null }],
}

function emptyResponse(operationId: string) {
  if (operationId === 'getAdminOverview') return { identity_count: 11, bucket_routing_count: 12, backend_count: 13, policy_count: 14 }
  if (operationId === 'getAdminReadiness') return ready
  if (operationId === 'adminHealth') return health
  throw new Error(`Unexpected operation: ${operationId}`)
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
  it('renders authoritative resource counts and the runtime summary', async () => {
    overviewMocks.invokeOperation.mockImplementation(async (operationId: string) => emptyResponse(operationId))
    renderOverview()

    expect(await screen.findByText('No configuration issues found.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Configuration readiness' }).parentElement?.textContent).toContain('Ready')
    expect(await screen.findByText('overview-test')).toBeTruthy()
    for (const [label, count] of [['S3 identities', '11'], ['Bucket routing', '12'], ['Azure backends', '13'], ['Policies', '14']]) {
      const link = screen.getByRole('link', { name: label })
      expect(link.parentElement?.querySelector('strong')?.textContent).toBe(count)
    }
    expect(overviewMocks.invokeOperation).toHaveBeenCalledWith('getAdminOverview', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(overviewMocks.invokeOperation).toHaveBeenCalledWith('getAdminReadiness', expect.objectContaining({ parameters: { query: { limit: 20 } }, signal: expect.any(AbortSignal) }))
    expect(overviewMocks.invokeOperation.mock.calls.map(([operationId]) => operationId).sort()).toEqual(['adminHealth', 'getAdminOverview', 'getAdminReadiness'])
  })

  it('renders bounded backend findings with local links', async () => {
    overviewMocks.invokeOperation.mockImplementation(async (operationId: string) => operationId === 'getAdminReadiness' ? attention : emptyResponse(operationId))
    renderOverview()
    expect(await screen.findByText('Needs attention')).toBeTruthy()
    expect(screen.getByText('Bucket mapping reports belongs to a disabled identity.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/buckets')
    expect(screen.getByText('Showing 1 of 1 findings')).toBeTruthy()
  })

  it('pages through every finding with opaque cursors and cached previous pages', async () => {
    const first = { ...attention, finding_count: 222, next_after_key: 'next-page' }
    const second = {
      ...attention,
      finding_count: 222,
      next_after_key: null,
      items: [{ ...attention.items[0], key: 'fedcba9876543210fedcba9876543210', display_name: 'archive' }],
    }
    overviewMocks.invokeOperation.mockImplementation(async (operationId: string, input?: { parameters?: { query?: { after_key?: string } } }) => {
      if (operationId === 'getAdminReadiness') return input?.parameters?.query?.after_key === 'next-page' ? second : first
      return emptyResponse(operationId)
    })
    renderOverview()

    expect(await screen.findByText('Bucket mapping reports belongs to a disabled identity.')).toBeTruthy()
    expect(screen.getByText('Page 1 of 12')).toBeTruthy()
    expect(screen.getByText('Showing 1 of 222 findings')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next configuration findings page' }))
    expect(await screen.findByText('Bucket mapping archive belongs to a disabled identity.')).toBeTruthy()
    expect(screen.getByText('Page 2 of 12')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous configuration findings page' }))
    expect(await screen.findByText('Bucket mapping reports belongs to a disabled identity.')).toBeTruthy()

    const readinessCalls = overviewMocks.invokeOperation.mock.calls.filter(([operationId]) => operationId === 'getAdminReadiness')
    expect(readinessCalls).toHaveLength(2)
    expect(readinessCalls[1]?.[1]).toEqual(expect.objectContaining({ parameters: { query: { limit: 20, after_key: 'next-page' } } }))
  })

  it('shows unavailable diagnostics and retries without affecting runtime health', async () => {
    let readinessAttempts = 0
    overviewMocks.invokeOperation.mockImplementation(async (operationId: string) => {
      if (operationId === 'getAdminReadiness' && ++readinessAttempts === 1) throw new Error('diagnostics unavailable')
      return emptyResponse(operationId)
    })
    renderOverview()
    expect(await screen.findByText('Configuration diagnostics unavailable.')).toBeTruthy()
    expect(screen.getByText('overview-test')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry configuration diagnostics' }))
    await waitFor(() => expect(readinessAttempts).toBe(2))
    expect(await screen.findByText('No configuration issues found.')).toBeTruthy()
  })

  it('keeps the last diagnostics visible when refresh fails', async () => {
    let readinessAttempts = 0
    overviewMocks.invokeOperation.mockImplementation(async (operationId: string) => {
      if (operationId === 'getAdminReadiness' && ++readinessAttempts > 1) throw new Error('refresh failed')
      return operationId === 'getAdminReadiness' ? attention : emptyResponse(operationId)
    })
    renderOverview()
    expect(await screen.findByText('Bucket mapping reports belongs to a disabled identity.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh configuration diagnostics' }))
    expect(await screen.findByText('Refresh failed; showing diagnostics from 2026-09-12T00:00:00Z.')).toBeTruthy()
    expect(screen.getByText('Bucket mapping reports belongs to a disabled identity.')).toBeTruthy()
  })

  it('shows unavailable counts and retries the summary request', async () => {
    let summaryAttempts = 0
    overviewMocks.invokeOperation.mockImplementation(async (operationId: string) => {
      if (operationId === 'getAdminOverview' && ++summaryAttempts === 1) throw new Error('summary request failed')
      return emptyResponse(operationId)
    })
    renderOverview()

    const identityMetric = screen.getByRole('link', { name: 'S3 identities' }).parentElement
    await waitFor(() => expect(identityMetric?.querySelector('strong')?.textContent).toBe('Unavailable'))
    const retry = identityMetric?.querySelector('button')
    if (!(retry instanceof HTMLButtonElement)) throw new Error('Expected the identity retry button')
    fireEvent.click(retry)

    await waitFor(() => expect(summaryAttempts).toBe(2))
    await waitFor(() => expect(identityMetric?.querySelector('strong')?.textContent).toBe('11'))
  })
})