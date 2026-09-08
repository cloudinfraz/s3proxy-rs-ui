import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { hasCsrfToken, setCsrfToken } from '../../api/client'
import { millisecondsUntilExpiry, readSession, type SessionValue } from './session-lifecycle'

const session: SessionValue = {
  authenticated: true,
  csrf_token: 'rotated-csrf',
  expires_at: '2026-09-07T12:00:00Z',
}

afterEach(() => { setCsrfToken(null); vi.unstubAllGlobals() })

describe('session lifecycle', () => {
  it('shares query revalidation and keeps CSRF out of the cache', async () => {
    let release: (response: Response) => void = () => {}
    const fetch = vi.fn(() => new Promise<Response>(resolve => { release = resolve }))
    vi.stubGlobal('fetch', fetch)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const options = { queryKey: ['session'], queryFn: ({ signal }: { signal: AbortSignal }) => readSession({ signal, isTerminated: () => false }) }
    const observer = new QueryObserver(client, options)
    const unsubscribe = observer.subscribe(() => {})
    try {
      const first = observer.refetch({ cancelRefetch: false })
      const second = observer.refetch({ cancelRefetch: false })
      release(Response.json(session))
      await Promise.all([first, second])
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(hasCsrfToken()).toBe(true)
      expect(client.getQueryData(['session'])).toEqual({ authenticated: true, expires_at: session.expires_at })
      expect(JSON.stringify(client.getQueryCache().getAll().map(query => query.state))).not.toContain(session.csrf_token)
    } finally { unsubscribe(); client.clear() }
  })

  it.each([403, 503])('propagates HTTP %s for the owner to distinguish termination from transient failure', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
    await expect(readSession({ signal: new AbortController().signal, isTerminated: () => false })).rejects.toMatchObject({ status })
    expect(hasCsrfToken()).toBe(false)
  })

  it.each(['abort', 'terminate'] as const)('does not install late CSRF after %s', async outcome => {
    let release: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
    const controller = new AbortController()
    let terminated = false
    const pending = readSession({ signal: controller.signal, isTerminated: () => terminated })
    if (outcome === 'abort') controller.abort()
    else terminated = true
    release(Response.json(session))
    await pending
    expect(hasCsrfToken()).toBe(false)
  })

  it('fails closed when the session explicitly reports unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...session, authenticated: false })))
    await expect(readSession({ signal: new AbortController().signal, isTerminated: () => false })).rejects.toMatchObject({ status: 403 })
    expect(hasCsrfToken()).toBe(false)
  })

  it.each([
    { authenticated: true, csrf_token: '', expires_at: session.expires_at },
    { authenticated: true, csrf_token: session.csrf_token, expires_at: 'invalid' },
    { authenticated: 'true', csrf_token: session.csrf_token, expires_at: session.expires_at },
  ])('rejects malformed authenticated session data', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))

    await expect(readSession({ signal: new AbortController().signal, isTerminated: () => false })).rejects.toMatchObject({ status: 502 })
    expect(hasCsrfToken()).toBe(false)
  })

  it('computes a bounded expiry delay and fails closed for invalid timestamps', () => {
    expect(millisecondsUntilExpiry('2030-01-01', 0)).toBe(2_147_483_647)
    expect(millisecondsUntilExpiry('2026-09-07T12:00:10Z', Date.parse('2026-09-07T12:00:00Z'))).toBe(10_000)
    expect(millisecondsUntilExpiry('2026-09-07T11:59:59Z', Date.parse('2026-09-07T12:00:00Z'))).toBe(0)
    expect(millisecondsUntilExpiry('invalid')).toBe(0)
  })
})