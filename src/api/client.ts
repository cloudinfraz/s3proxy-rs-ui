import type { paths } from './schema'

export type LoginResponse = paths['/admin/session/login']['post']['responses']['200']['content']['application/json']

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let csrfToken: string | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

export function hasCsrfToken() {
  return csrfToken !== null
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  if (mutating && path !== '/admin/session/login') {
    if (!csrfToken) throw new ApiError(403, 'The browser session has no CSRF token. Sign in again.')
    headers.set('x-csrf-token', csrfToken)
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = await response.text()
    let message = body || response.statusText
    try {
      const json = JSON.parse(body) as { message?: string; Message?: string }
      message = json.message ?? json.Message ?? message
    } catch {
      // Keep non-JSON server response.
    }
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function login(apiKey: string): Promise<LoginResponse> {
  const response = await api<LoginResponse>('/admin/session/login', {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey }),
  })
  setCsrfToken(response.csrf_token)
  return response
}

export async function logout() {
  await api<void>('/admin/session', { method: 'DELETE' })
  setCsrfToken(null)
}
