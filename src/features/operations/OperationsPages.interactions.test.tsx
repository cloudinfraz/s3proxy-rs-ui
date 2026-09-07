// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { ApiError } from '../../api/client'
import AdminKeysPage from './AdminKeysPage'
import AuditPage from './AuditPage'
import HealthPage from './HealthPage'

const operationsMocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock('../../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  api: operationsMocks.api,
}))

const adminKey = {
  id: 'key-1',
  key_name: 'automation',
  description: null,
  enabled: true,
  created_at: '2026-09-01T00:00:00Z',
  last_used_at: null,
  expires_at: null,
  created_by: 'test',
  status: 'active',
}

const health = {
  status: 'healthy',
  version: 'test-version',
  timestamp: '2026-09-07T00:00:00Z',
  cache: { mode: 'memory', available: true, redis_connected: false },
  credentials: { count: 1 },
  multipart: { store_type: 'memory', redis_available: false, persistence: 'ephemeral', warning: null },
  authorization: { mode: 'enforce', coherence: 'strict', resolver_ready: true, database_ready: true, audit_required: true, audit_dispatcher_ready: true },
}

function renderPage(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>)
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    media: '(max-width: 560px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })))
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('operations page interactions', () => {
  it('creates an admin key from form values and requires acknowledgement of the returned secret', async () => {
    operationsMocks.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if (path === '/admin/api-keys' && init.method === 'POST') return { api_key: 'one-time-admin-secret' }
      if (path === '/admin/api-keys') return [adminKey]
      throw new Error(`Unexpected API request: ${path}`)
    })
    renderPage(<AdminKeysPage />)

    expect(await screen.findByText('automation')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create admin key' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'release-key' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'release automation' } })
    fireEvent.change(screen.getByLabelText('Expires in days'), { target: { value: '14' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }))

    expect(await screen.findByText('one-time-admin-secret')).toBeTruthy()
    expect(operationsMocks.api).toHaveBeenCalledWith('/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ key_name: 'release-key', description: 'release automation', expires_in_days: 14, created_by: 'browser-ui' }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'I have stored this securely' }))
    await waitFor(() => expect(screen.queryByText('one-time-admin-secret')).toBeNull())
  })

  it('validates key fields, sends null optional values, and keeps creation errors actionable', async () => {
    let createResult: 'missing-secret' | 'api-error' = 'missing-secret'
    operationsMocks.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if (path === '/admin/api-keys' && init.method === 'POST') {
        if (createResult === 'api-error') throw new ApiError(422, 'invalid key')
        return {}
      }
      if (path === '/admin/api-keys') return [adminKey]
      throw new Error(`Unexpected API request: ${path}`)
    })
    renderPage(<AdminKeysPage />)

    expect(await screen.findByText('automation')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create admin key' }))
    const name = screen.getByLabelText('Name')
    const expires = screen.getByLabelText('Expires in days')
    if (!(name instanceof HTMLInputElement) || !(expires instanceof HTMLInputElement)) throw new Error('Expected key form inputs')

    operationsMocks.api.mockClear()
    fireEvent.change(expires, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }))
    expect(name.validity.valueMissing).toBe(true)
    expect(expires.validity.rangeUnderflow).toBe(true)
    expect(operationsMocks.api).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: 'minimal-key' } })
    fireEvent.change(expires, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Admin key creation failed')
    expect(operationsMocks.api).toHaveBeenCalledWith('/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ key_name: 'minimal-key', description: null, expires_in_days: null, created_by: 'browser-ui' }),
    })

    createResult = 'api-error'
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 422'))
    expect(screen.getByRole('dialog', { name: 'Create admin key' })).toBeTruthy()
  })

  it('enables and deletes admin keys with the selected action payload', async () => {
    const disabledKey = { ...adminKey, id: 'key-2', key_name: 'standby', enabled: false, status: 'disabled' }
    const encodedKey = { ...adminKey, id: 'key-3', key_name: 'release/key' }
    operationsMocks.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if (path === '/admin/api-keys') return [disabledKey, encodedKey]
      if (path.startsWith('/admin/api-keys/') && (init.method === 'PUT' || init.method === 'DELETE')) return undefined
      throw new Error(`Unexpected API request: ${path}`)
    })
    renderPage(<AdminKeysPage />)

    expect(await screen.findByText('standby')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enable standby' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enable standby' }))
    await waitFor(() => expect(operationsMocks.api).toHaveBeenCalledWith('/admin/api-keys/standby', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
    }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Delete release/key' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete release/key' }))
    await waitFor(() => expect(operationsMocks.api).toHaveBeenCalledWith('/admin/api-keys/release%2Fkey', { method: 'DELETE' }))
  })

  it('keeps an admin-key action open when the update fails', async () => {
    operationsMocks.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if (path === '/admin/api-keys' && !init.method) return [adminKey]
      if (path === '/admin/api-keys/automation' && init.method === 'PUT') throw new ApiError(409, 'changed')
      throw new Error(`Unexpected API request: ${path}`)
    })
    renderPage(<AdminKeysPage />)

    expect(await screen.findByText('automation')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Disable automation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disable automation' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Admin key update failed (HTTP 409)'))
    expect(screen.getByRole('alertdialog', { name: 'Disable admin key' })).toBeTruthy()
  })

  it('changes the audit window, pages through results, and refreshes on demand', async () => {
    const events = Array.from({ length: 30 }, (_, index) => ({
      id: `event-${index}`,
      entity_type: 'key',
      entity_id: `entity-${index}`,
      action: `event-${index}`,
      changed_by: index % 2 ? null : 'operator',
      changes: null,
      created_at: `2026-09-07T00:${String(index).padStart(2, '0')}:00Z`,
    }))
    operationsMocks.api.mockResolvedValue(events)
    renderPage(<AuditPage />)

    expect(await screen.findByText('event-0')).toBeTruthy()
    expect(screen.queryByText('event-25')).toBeNull()
    fireEvent.change(screen.getByLabelText('Recent events'), { target: { value: '25' } })
    await waitFor(() => expect(operationsMocks.api).toHaveBeenCalledWith('/admin/audit?limit=25'))
    const nextPage = screen.getByRole('button', { name: 'Next page' })
    if (!(nextPage instanceof HTMLButtonElement)) throw new Error('Expected the next-page button')
    await waitFor(() => expect(nextPage.disabled).toBe(false))
    fireEvent.click(nextPage)
    expect(await screen.findByText('event-25')).toBeTruthy()
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(await screen.findByText('event-0')).toBeTruthy()
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()

    const callsBeforeRefresh = operationsMocks.api.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(operationsMocks.api.mock.calls.length).toBeGreaterThan(callsBeforeRefresh))
  })

  it('recovers the health panel from an accessible request failure', async () => {
    operationsMocks.api.mockRejectedValueOnce(new Error('health unavailable')).mockResolvedValueOnce(health)
    renderPage(<HealthPage />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('health unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('test-version')).toBeTruthy()
    expect(screen.getByText('healthy')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retains the last successful health reading when a refresh fails', async () => {
    operationsMocks.api.mockResolvedValueOnce(health).mockRejectedValueOnce(new Error('refresh unavailable'))
    renderPage(<HealthPage />)

    expect(await screen.findByText('test-version')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByText('Last successful reading')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('refresh unavailable')
    expect(screen.getByText('test-version')).toBeTruthy()
  })
})