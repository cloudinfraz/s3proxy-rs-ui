// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { controlKeys } from '../../api/query-keys'
import LoginPage from './LoginPage'
import { SessionRevocationProvider } from './revocation'

const clientMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  setCsrfToken: vi.fn(),
}))

vi.mock('../../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  getSession: clientMocks.getSession,
  login: clientMocks.login,
  logout: clientMocks.logout,
  setCsrfToken: clientMocks.setCsrfToken,
}))

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SessionRevocationProvider><MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<h1>Overview destination</h1>} />
        </Routes>
      </MemoryRouter></SessionRevocationProvider>
    </QueryClientProvider>,
  )
  return client
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  vi.clearAllMocks()
})

beforeEach(() => {
  clientMocks.getSession.mockReset()
  clientMocks.login.mockReset()
  clientMocks.logout.mockReset()
})

describe('LoginPage interactions', () => {
  it('establishes the local session and replaces the login route', async () => {
    clientMocks.login.mockResolvedValue({ csrf_token: 'csrf-test', expires_at: '2030-01-01T00:00:00Z' })
    const client = renderLogin()

    fireEvent.change(screen.getByLabelText('Admin API key'), { target: { value: 'admin-test-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('heading', { name: 'Overview destination' })).toBeTruthy()
    expect(clientMocks.login).toHaveBeenCalledWith('admin-test-key')
    expect(clientMocks.setCsrfToken).toHaveBeenCalledWith('csrf-test')
    expect(client.getQueryData(controlKeys.session)).toEqual({ authenticated: true, expires_at: '2030-01-01T00:00:00Z' })
  })

  it('clears the submitted key and presents a retryable failure state', async () => {
    clientMocks.login.mockRejectedValue(new Error('network details must stay hidden'))
    renderLogin()
    const key = screen.getByLabelText('Admin API key')
    const form = key.closest('form')
    if (!(key instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) throw new Error('Expected the login form controls')

    fireEvent.change(key, { target: { value: 'rejected-key' } })
    fireEvent.submit(form)

    expect((await screen.findByRole('alert')).textContent).toContain('Sign in failed. Check the key and try again.')
    expect(key.value).toBe('')
    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Continue' })
      if (!(button instanceof HTMLButtonElement)) throw new Error('Expected the submit button')
      expect(button.disabled).toBe(false)
    })
    expect(clientMocks.setCsrfToken).not.toHaveBeenCalled()
  })

  it('replaces sign-in with a sanitized warning while revocation is unresolved', () => {
    window.sessionStorage.setItem('s3proxy.pending-session-revocation', 'private-marker-detail')

    renderLogin()

    expect(screen.getByRole('heading', { name: 'Session revocation pending' })).toBeTruthy()
    expect(screen.queryByLabelText('Admin API key')).toBeNull()
    expect(screen.queryByText('private-marker-detail')).toBeNull()
    expect(clientMocks.login).not.toHaveBeenCalled()
  })

  it('disables duplicate retry and restores the retry action after failure', async () => {
    let rejectSession: (reason?: unknown) => void = () => {}
    clientMocks.getSession.mockReturnValue(new Promise((_resolve, reject) => { rejectSession = reject }))
    window.sessionStorage.setItem('s3proxy.pending-session-revocation', 'pending')
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: 'Retry revocation' }))

    const retrying = await screen.findByRole('button', { name: 'Retrying...' })
    if (!(retrying instanceof HTMLButtonElement)) throw new Error('Expected the retry button')
    expect(retrying.disabled).toBe(true)
    fireEvent.click(retrying)
    expect(clientMocks.getSession).toHaveBeenCalledOnce()

    await act(async () => { rejectSession(new Error('private verification failure')) })
    expect(await screen.findByRole('button', { name: 'Retry revocation' })).toBeTruthy()
    expect(screen.queryByLabelText('Admin API key')).toBeNull()
    expect(screen.queryByText('private verification failure')).toBeNull()
  })
})