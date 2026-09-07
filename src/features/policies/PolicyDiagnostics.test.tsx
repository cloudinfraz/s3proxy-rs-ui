// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import PolicyDiagnostics from './PolicyDiagnostics'

vi.mock('@tanstack/react-query', async importOriginal => ({ ...(await importOriginal<typeof import('@tanstack/react-query')>()), useQuery: vi.fn() }))
vi.mock('../../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  api: vi.fn(),
}))
vi.mock('../../components/control', () => ({
  ErrorBanner: ({ error, retry }: { error: Error; retry?: () => void }) => <div role="alert">{error.message}{retry && <button onClick={retry}>Retry</button>}</div>,
  DataTable: ({ rows, columns }: { rows: unknown[]; columns: Array<{ label: string; value: (row: never) => ReactNode }> }) => <div>{rows.map((row, index) => <div key={index}>{columns.map(column => <span key={column.label}>{column.value(row as never)}</span>)}</div>)}</div>,
}))

const identity = { credential_id: '11111111-1111-4111-8111-111111111111', s3_access_key: 'SIMULATOR_KEY' }
beforeEach(() => vi.mocked(useQuery).mockReturnValue({ data: [identity], isError: false, refetch: vi.fn() } as never))
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('PolicyDiagnostics', () => {
  it('runs preflight and renders bounded findings', async () => {
    vi.mocked(api).mockResolvedValue({ returned: 1, limit: 100, truncated: false, items: [{ kind: 'managed_policy', stable_id: 'policy', name: 'BrokenPolicy', reasons: ['unsupported action'] }] })
    render(<PolicyDiagnostics />)
    fireEvent.click(screen.getByRole('button', { name: /Run preflight/ }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Returned 1 of limit 100'))
    expect(screen.getByText('unsupported action')).toBeTruthy()
  })

  it('recovers from a preflight error and reports truncated results', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('preflight unavailable')).mockResolvedValueOnce({ returned: 100, limit: 100, truncated: true, items: [] })
    render(<PolicyDiagnostics />)
    fireEvent.click(screen.getByRole('button', { name: /Run preflight/ }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('preflight unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Results are truncated'))
    expect(api).toHaveBeenCalledTimes(2)
  })

  it('validates duplicate conditions before making a request', () => {
    render(<PolicyDiagnostics />)
    fireEvent.click(screen.getByRole('button', { name: /Add condition/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add condition/ }))
    const keys = screen.getAllByLabelText('Condition key')
    fireEvent.change(keys[0], { target: { value: 'aws:SecureTransport' } })
    fireEvent.change(keys[1], { target: { value: 'aws:SecureTransport' } })
    fireEvent.submit(screen.getByRole('button', { name: /Simulate/ }).closest('form')!)
    expect(screen.getByRole('alert').textContent).toContain('Condition keys must be unique')
    expect(api).not.toHaveBeenCalled()
  })

  it('simulates an identity and renders allow results, then fails closed on 503', async () => {
    vi.mocked(api).mockResolvedValueOnce({ allowed: true, effect: 'Allow', matched_sid: 'ReadObjects', evaluated_policies: 2 })
    render(<PolicyDiagnostics />)
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: identity.credential_id } })
    fireEvent.submit(screen.getByRole('button', { name: /Simulate/ }).closest('form')!)
    expect(await screen.findByText('Allowed')).toBeTruthy()
    expect(screen.getByText(/Matched statement: ReadObjects/)).toBeTruthy()
    cleanup()
    vi.mocked(useQuery).mockReturnValue({ data: [identity], isError: false, refetch: vi.fn() } as never)
    vi.mocked(api).mockRejectedValueOnce(new ApiError(503, 'unavailable'))
    render(<PolicyDiagnostics />)
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: identity.credential_id } })
    fireEvent.submit(screen.getByRole('button', { name: /Simulate/ }).closest('form')!)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('failed closed'))
  })

  it('removes condition input and renders a deny without an optional statement match', async () => {
    vi.mocked(api).mockResolvedValueOnce({ allowed: false, effect: 'ImplicitDeny', matched_sid: null, evaluated_policies: 0 })
    render(<PolicyDiagnostics />)
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: identity.credential_id } })
    fireEvent.click(screen.getByRole('button', { name: /Add condition/ }))
    expect(screen.getByLabelText('Condition key')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition' }))
    expect(screen.queryByLabelText('Condition key')).toBeNull()
    fireEvent.submit(screen.getByRole('button', { name: /Simulate/ }).closest('form')!)

    expect(await screen.findByText('Implicit deny')).toBeTruthy()
    expect(screen.getByText('No matching statement ID')).toBeTruthy()
    expect(screen.getByText(/0 persisted policies evaluated/)).toBeTruthy()
  })
})