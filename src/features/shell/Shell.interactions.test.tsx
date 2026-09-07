// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ApiError } from '../../api/client'
import Shell from './Shell'

const shellMocks = vi.hoisted(() => ({
  api: vi.fn(),
  logout: vi.fn(),
  readSession: vi.fn(),
  setCsrfToken: vi.fn(),
  setProtectedForbiddenHandler: vi.fn(),
}))

vi.mock('../../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  api: shellMocks.api,
  logout: shellMocks.logout,
  setCsrfToken: shellMocks.setCsrfToken,
  setProtectedForbiddenHandler: shellMocks.setProtectedForbiddenHandler,
}))

vi.mock('./session-lifecycle', () => ({
  readSession: shellMocks.readSession,
  millisecondsUntilExpiry: () => 60_000,
}))

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<h1>Login destination</h1>} />
          <Route path="/" element={<Shell />}>
            <Route index element={<h1>Overview content</h1>} />
            <Route path="audit" element={<h1>Audit content</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  shellMocks.api.mockResolvedValue({ plane: 'test' })
  shellMocks.logout.mockResolvedValue(undefined)
  shellMocks.readSession.mockResolvedValue({ authenticated: true, expires_at: '2030-01-01T00:00:00Z' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Shell interactions', () => {
  it('renders the protected outlet, navigates, and clears the session on sign out', async () => {
    const client = renderShell()
    const clear = vi.spyOn(client, 'clear')

    expect(await screen.findByRole('heading', { name: 'Overview content' })).toBeTruthy()
    expect(await screen.findByText('test plane')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Audit' }))
    expect(await screen.findByRole('heading', { name: 'Audit content' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Login destination' })).toBeTruthy()
    expect(shellMocks.logout).toHaveBeenCalledOnce()
    expect(shellMocks.setCsrfToken).toHaveBeenCalledWith(null)
    expect(clear).toHaveBeenCalledOnce()
  })

  it('redirects a forbidden session to login', async () => {
    shellMocks.readSession.mockRejectedValue(new ApiError(403, 'Sign in again.'))
    renderShell()

    expect(await screen.findByRole('heading', { name: 'Login destination' })).toBeTruthy()
    expect(shellMocks.setCsrfToken).toHaveBeenCalledWith(null)
    await waitFor(() => expect(shellMocks.setProtectedForbiddenHandler).toHaveBeenLastCalledWith(null))
  })
})