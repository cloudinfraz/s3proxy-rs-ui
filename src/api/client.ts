import type { paths } from './schema'

export type LoginResponse = paths['/admin/session/login']['post']['responses']['200']['content']['application/json']
export type SessionResponse = paths['/admin/session']['get']['responses']['200']['content']['application/json']

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, message: string, code: string | null = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

export type ApiErrorContext = Readonly<{ path: string; method: string }>
export type ApiErrorInterceptor = (error: ApiError, context: ApiErrorContext) => void

let csrfToken: string | null = null
let protectedForbiddenHandler: (() => void) | null = null
const apiErrorInterceptors = new Set<ApiErrorInterceptor>()

const statusMessages: Readonly<Record<number, string>> = {
  400: 'The request is invalid. Review the entered values and try again.',
  403: 'The request was denied. Your session will be verified.',
  404: 'The requested resource no longer exists. Refresh and try again.',
  409: 'The resource changed. Refresh it before trying again.',
  422: 'The request contains invalid values. Review the form and try again.',
  429: 'Too many requests were made. Wait and try again.',
  500: 'The control service could not complete the request.',
  501: 'This operation is not supported.',
  503: 'The control service is temporarily unavailable. Retry the request.',
}

const safeCodes = new Set([
  'AccessDenied',
  'Conflict',
  'InvalidArgument',
  'InvalidRequest',
  'NotFound',
  'NotImplemented',
  'ServiceUnavailable',
  'SlowDown',
])

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

export function hasCsrfToken() {
  return csrfToken !== null
}

export function setProtectedForbiddenHandler(handler: (() => void) | null) {
  protectedForbiddenHandler = handler
}

export function addApiErrorInterceptor(interceptor: ApiErrorInterceptor) {
  apiErrorInterceptors.add(interceptor)
  return () => { apiErrorInterceptors.delete(interceptor) }
}

function interceptApiError(error: ApiError, context: ApiErrorContext) {
  for (const interceptor of apiErrorInterceptors) {
    try { interceptor(error, context) } catch { continue }
  }
  return error
}

function safeErrorCode(response: Response, body: string): string | null {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const value = JSON.parse(body) as { code?: unknown; Code?: unknown }
      const code = typeof value.code === 'string' ? value.code : value.Code
      return typeof code === 'string' && safeCodes.has(code) ? code : null
    } catch {
      return null
    }
  }
  if ((contentType.includes('xml') || body.trimStart().startsWith('<?xml')) && typeof DOMParser !== 'undefined') {
    const code = new DOMParser().parseFromString(body, 'application/xml').querySelector('Code')?.textContent
    return code && safeCodes.has(code) ? code : null
  }
  return null
}

async function readBoundedText(response: Response, maximumBytes = 16_384) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) return result + decoder.decode()
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      return ''
    }
    result += decoder.decode(value, { stream: true })
  }
}

async function toApiError(response: Response) {
  const body = await readBoundedText(response).catch(() => '')
  const code = safeErrorCode(response, body)
  const message = statusMessages[response.status] ?? `The request failed (HTTP ${response.status}).`
  return new ApiError(response.status, message, code)
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const context = { path, method }
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  if (mutating && path !== '/admin/session/login') {
    if (!csrfToken) throw interceptApiError(new ApiError(403, 'The browser session has no CSRF token. Sign in again.'), context)
    headers.set('x-csrf-token', csrfToken)
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  }).catch(() => {
    throw interceptApiError(new ApiError(0, 'The control service could not be reached. Retry the request.'), context)
  })
  if (!response.ok) {
    const error = await toApiError(response)
    if (response.status === 403 && path !== '/admin/session' && path !== '/admin/session/login') {
      protectedForbiddenHandler?.()
    }
    throw interceptApiError(error, context)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function invalidSessionResponse(): ApiError {
  return new ApiError(502, 'The control service returned an invalid session response.')
}

function parseSessionCredentials(value: unknown): LoginResponse {
  if (!value || typeof value !== 'object') throw invalidSessionResponse()
  const token = Reflect.get(value, 'csrf_token')
  const expiresAt = Reflect.get(value, 'expires_at')
  if (typeof token !== 'string' || token.trim() === '') throw invalidSessionResponse()
  if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) throw invalidSessionResponse()
  return { csrf_token: token, expires_at: expiresAt }
}

export async function login(apiKey: string): Promise<LoginResponse> {
  const value = await api<unknown>('/admin/session/login', {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey }),
  })
  return parseSessionCredentials(value)
}

export async function getSession(signal?: AbortSignal): Promise<SessionResponse> {
  const value = await api<unknown>('/admin/session', { signal })
  if (!value || typeof value !== 'object') throw invalidSessionResponse()
  const authenticated = Reflect.get(value, 'authenticated')
  if (typeof authenticated !== 'boolean') throw invalidSessionResponse()
  if (!authenticated) return { authenticated, csrf_token: '', expires_at: '' }
  return { authenticated, ...parseSessionCredentials(value) }
}

export async function logout() {
  await api<void>('/admin/session', { method: 'DELETE' })
  setCsrfToken(null)
}
