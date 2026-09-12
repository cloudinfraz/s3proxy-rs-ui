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

function emptyResponse(operationId: string) {
  if (operationId === 'getAdminOverview') return { identity_count: 11, bucket_routing_count: 12, backend_count: 13, policy_count: 14 }
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

    expect(await screen.findByText('Configuration readiness requires an authoritative backend summary.')).toBeTruthy()
    expect(await screen.findByText('overview-test')).toBeTruthy()
    for (const [label, count] of [['S3 identities', '11'], ['Bucket routing', '12'], ['Azure backends', '13'], ['Policies', '14']]) {
      const link = screen.getByRole('link', { name: label })
      expect(link.parentElement?.querySelector('strong')?.textContent).toBe(count)
    }
    expect(overviewMocks.invokeOperation).toHaveBeenCalledWith('getAdminOverview', expect.objectContaining({ signal: expect.any(AbortSignal) }))
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