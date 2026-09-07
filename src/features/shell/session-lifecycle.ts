import { api, ApiError, setCsrfToken } from '../../api/client'

export type SessionValue = {
  authenticated: boolean
  csrf_token: string
  expires_at: string
}

export async function readSession({ signal, isTerminated }: { signal: AbortSignal; isTerminated: () => boolean }) {
  const value = await api<SessionValue>('/admin/session', { signal })
  if (!value.authenticated) throw new ApiError(403, 'Sign in again.')
  if (!signal.aborted && !isTerminated()) setCsrfToken(value.csrf_token)
  return { authenticated: value.authenticated, expires_at: value.expires_at }
}

export function millisecondsUntilExpiry(expiresAt: string, now = Date.now()) {
  const expiry = Date.parse(expiresAt)
  return Number.isFinite(expiry) ? Math.min(2_147_483_647, Math.max(0, expiry - now)) : 0
}