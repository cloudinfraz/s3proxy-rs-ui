// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { SessionRevocationProvider } from './revocation'
import { useSessionRevocation } from './revocation-context'

const apiMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  logout: vi.fn(),
  setCsrfToken: vi.fn(),
}))

vi.mock('../../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  getSession: apiMocks.getSession,
  logout: apiMocks.logout,
  setCsrfToken: apiMocks.setCsrfToken,
}))

function Probe() {
  const revocation = useSessionRevocation()
  return <>
    <div>{revocation.status}</div>
    {revocation.error && <div>{revocation.error.message}</div>}
    <button onClick={revocation.markFailed}>Fail</button>
    <button onClick={() => { void revocation.retry() }}>Retry</button>
  </>
}

function renderProbe() {
  render(<SessionRevocationProvider><Probe /></SessionRevocationProvider>)
}

beforeEach(() => {
  window.sessionStorage.clear()
  apiMocks.getSession.mockReset()
  apiMocks.logout.mockReset()
  apiMocks.setCsrfToken.mockReset()
})

afterEach(cleanup)

describe('session revocation recovery', () => {
  it('retains failed revocation state across provider remounts without storing secrets', () => {
    const view = render(<SessionRevocationProvider><Probe /></SessionRevocationProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }))
    expect(screen.getByText('failed')).toBeTruthy()
    expect(window.sessionStorage.length).toBe(1)
    expect(Object.values(window.sessionStorage)).toEqual(['pending'])

    view.unmount()
    renderProbe()
    expect(screen.getByText('failed')).toBeTruthy()
    expect(screen.getByText(/protected access remains blocked/i)).toBeTruthy()
  })

  it('reacquires CSRF and clears pending state only after deletion succeeds', async () => {
    apiMocks.getSession.mockResolvedValue({ authenticated: true, csrf_token: 'fresh-csrf', expires_at: '2099-01-01T00:00:00Z' })
    apiMocks.logout.mockResolvedValue(undefined)
    renderProbe()
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }))

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })

    expect(apiMocks.setCsrfToken).toHaveBeenNthCalledWith(1, null)
    expect(apiMocks.setCsrfToken).toHaveBeenNthCalledWith(2, 'fresh-csrf')
    expect(apiMocks.logout).toHaveBeenCalledOnce()
    expect(apiMocks.setCsrfToken).toHaveBeenLastCalledWith(null)
    expect(screen.getByText('idle')).toBeTruthy()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('accepts authoritative unauthenticated verification without deleting again', async () => {
    apiMocks.getSession.mockRejectedValue(new ApiError(403, 'Sign in again.'))
    renderProbe()
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }))

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })

    expect(apiMocks.logout).not.toHaveBeenCalled()
    expect(screen.getByText('idle')).toBeTruthy()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('remains blocked and retryable when verification fails', async () => {
    apiMocks.getSession.mockRejectedValue(new ApiError(503, 'Unavailable'))
    renderProbe()
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }))

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })

    expect(screen.getByText('failed')).toBeTruthy()
    expect(window.sessionStorage.length).toBe(1)
    expect(apiMocks.setCsrfToken).toHaveBeenLastCalledWith(null)
  })

  it('coalesces repeated retry activation into one server attempt', async () => {
    let releaseSession: (value: { authenticated: false; csrf_token: string; expires_at: string }) => void = () => {}
    apiMocks.getSession.mockReturnValue(new Promise(resolve => { releaseSession = resolve }))
    renderProbe()
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }))

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(apiMocks.getSession).toHaveBeenCalledOnce()
    await act(async () => { releaseSession({ authenticated: false, csrf_token: '', expires_at: '' }) })

    expect(screen.getByText('idle')).toBeTruthy()
  })
})