import { afterEach, describe, expect, it, vi } from 'vitest'
import { addApiErrorInterceptor, ApiError, api, getSession, hasCsrfToken, login, logout, setCsrfToken, setProtectedForbiddenHandler } from './client'

const response = (body: unknown, status = 200) => new Response(
  status === 204 ? null : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } },
)

afterEach(() => {
  setCsrfToken(null)
  setProtectedForbiddenHandler(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

    const result = await login('admin-key-value')

    expect(result.csrf_token).toBe('csrf-value')
    expect(hasCsrfToken()).toBe(false)
    expect(localSet).not.toHaveBeenCalled()
    expect(sessionSet).not.toHaveBeenCalled()
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.body).toBe(JSON.stringify({ api_key: 'admin-key-value' }))
    expect(init?.credentials).toBe('same-origin')
  })

  it.each([
    {},
    { csrf_token: '', expires_at: '2030-01-01T00:00:00Z' },
    { csrf_token: 'csrf-value', expires_at: 'invalid' },
  ])('rejects malformed successful login data without installing a session', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)))

    await expect(login('admin-key')).rejects.toMatchObject({ status: 502 })
    expect(hasCsrfToken()).toBe(false)
  })

  it('validates successful session data before returning it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ authenticated: true, csrf_token: 'csrf-value', expires_at: null })))

    await expect(getSession()).rejects.toMatchObject({ status: 502 })
  })

  it('returns validated authoritative session data without installing its CSRF token', async () => {
    const session = { authenticated: true, csrf_token: 'verification-csrf', expires_at: '2030-01-01T00:00:00Z' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(session)))

    await expect(getSession()).resolves.toEqual(session)

    expect(hasCsrfToken()).toBe(false)
    const [path, init] = vi.mocked(fetch).mock.calls[0]
    expect(path).toBe('/admin/session')
    expect(init?.credentials).toBe('same-origin')
    expect(init?.cache).toBe('no-store')
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

  it.each([
    ['application/json', JSON.stringify({ code: 'AccessDenied', message: 'credential=secret-value' })],
    ['application/xml', '<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>secret-value</Message></Error>'],
    ['text/plain', 'database detail and secret-value'],
  ])('renders a bounded safe message instead of a %s response body', async (contentType, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 403, headers: { 'content-type': contentType } })))

    const error = await api('/admin/capabilities').catch(cause => cause)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 403, message: 'The request was denied. Your session will be verified.' })
    expect(String(error)).not.toContain('secret-value')
  })

  it('discards an oversized error body before exposing an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret-value'.repeat(2_000), { status: 500 })))

    const error = await api('/admin/health').catch(cause => cause)

    expect(error).toMatchObject({ status: 500, message: 'The control service could not complete the request.' })
    expect(String(error)).not.toContain('secret-value')
  })

  it('cancels the stream at the byte limit and does not parse a partial code', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(16_385)) },
      cancel,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 500 })))
    await expect(api('/admin/health')).rejects.toMatchObject({ status: 500, code: null })
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(true)
  })

  it('preserves safe status and forbidden handling when reading the body fails', async () => {
    const forbidden = vi.fn()
    setProtectedForbiddenHandler(forbidden)
    const stream = new ReadableStream({ start(controller) { controller.error(new Error('synthetic-private-detail')) } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 403 })))
    await expect(api('/admin/health')).rejects.toMatchObject({ status: 403, message: 'The request was denied. Your session will be verified.' })
    expect(forbidden).toHaveBeenCalledOnce()
  })

  it('does not expose transport exception details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('synthetic-private-detail')))
    await expect(api('/admin/health')).rejects.toMatchObject({ status: 0, message: 'The control service could not be reached. Retry the request.' })
  })

  it.each(['Conflict', 'NotFound', 'InvalidArgument'])('preserves the allowlisted %s code', async code => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ code }, 400)))
    await expect(api('/admin/health')).rejects.toMatchObject({ status: 400, code })
  })

  it('notifies once for a protected 403 but does not recurse on session endpoints', async () => {
    const forbidden = vi.fn()
    setProtectedForbiddenHandler(forbidden)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response({ code: 'AccessDenied' }, 403)))

    await expect(api('/admin/capabilities')).rejects.toBeInstanceOf(ApiError)
    await expect(api('/admin/session')).rejects.toBeInstanceOf(ApiError)
    await expect(api('/admin/session/login', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(ApiError)

    expect(forbidden).toHaveBeenCalledTimes(1)
  })

  it('intercepts sanitized CSRF, transport, and response errors with request context', async () => {
    const interceptor = vi.fn()
    const remove = addApiErrorInterceptor(interceptor)

    await expect(api('/admin/api-keys', { method: 'POST' })).rejects.toBeInstanceOf(ApiError)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private transport detail')))
    await expect(api('/admin/health')).rejects.toBeInstanceOf(ApiError)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ message: 'private response detail' }, 503)))
    await expect(api('/admin/health')).rejects.toBeInstanceOf(ApiError)
    remove()

    expect(interceptor).toHaveBeenCalledTimes(3)
    expect(interceptor.mock.calls).toEqual([
      [expect.objectContaining({ status: 403 }), { path: '/admin/api-keys', method: 'POST' }],
      [expect.objectContaining({ status: 0, message: 'The control service could not be reached. Retry the request.' }), { path: '/admin/health', method: 'GET' }],
      [expect.objectContaining({ status: 503, message: 'The control service is temporarily unavailable. Retry the request.' }), { path: '/admin/health', method: 'GET' }],
    ])
  })
})
