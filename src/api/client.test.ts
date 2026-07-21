import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, hasCsrfToken, login, logout, setCsrfToken } from './client'

const response = (body: unknown, status = 200) => new Response(
  status === 204 ? null : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } },
)

afterEach(() => {
  setCsrfToken(null)
  vi.restoreAllMocks()
})

describe('browser API client', () => {
  it('keeps the login key and CSRF token out of browser storage', async () => {
    const localSet = vi.fn()
    const sessionSet = vi.fn()
    vi.stubGlobal('localStorage', { setItem: localSet })
    vi.stubGlobal('sessionStorage', { setItem: sessionSet })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      csrf_token: 'csrf-value',
      expires_at: '2026-07-22T00:00:00Z',
    })))

    await login('admin-key-value')

    expect(hasCsrfToken()).toBe(true)
    expect(localSet).not.toHaveBeenCalled()
    expect(sessionSet).not.toHaveBeenCalled()
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.body).toBe(JSON.stringify({ api_key: 'admin-key-value' }))
    expect(init?.credentials).toBe('same-origin')
  })

  it('requires and sends the in-memory CSRF token for mutations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(undefined, 204)))
    await expect(api('/admin/api-keys/key', { method: 'DELETE' })).rejects.toThrow('no CSRF token')

    setCsrfToken('csrf-value')
    await api('/admin/api-keys/key', { method: 'DELETE' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf-value')
  })

  it('clears CSRF state after logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(undefined, 204)))
    setCsrfToken('csrf-value')
    await logout()
    expect(hasCsrfToken()).toBe(false)
  })
})
