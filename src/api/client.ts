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

export type TransportResponse = Readonly<{ status: number; value: unknown }>
const requestTimeoutMilliseconds = 30_000

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

export async function requestTransport(path: string, init: RequestInit = {}): Promise<TransportResponse> {
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

  const callerSignal = init.signal
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort(callerSignal ? abortReason(callerSignal) : undefined)
  if (callerSignal?.aborted) cancel()
  else callerSignal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('The control service request timed out.', 'TimeoutError'))
  }, requestTimeoutMilliseconds)
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    }).catch(() => {
      if (callerSignal?.aborted) throw abortReason(callerSignal)
      if (timedOut) throw interceptApiError(new ApiError(408, 'The control service request timed out. Retry the request.'), context)
      throw interceptApiError(new ApiError(0, 'The control service could not be reached. Retry the request.'), context)
    })
    if (!response.ok) {
      const error = await toApiError(response)
      if (response.status === 403 && path !== '/admin/session' && path !== '/admin/session/login') {
        protectedForbiddenHandler?.()
      }
      throw interceptApiError(error, context)
    }
    if (response.status === 204) return { status: response.status, value: undefined }
    const contentType = response.headers.get('content-type') ?? ''
    if (!/\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(contentType)) {
      await response.body?.cancel().catch(() => undefined)
      throw interceptApiError(new ApiError(502, 'The control service returned an invalid response.'), context)
    }
    try {
      return { status: response.status, value: await response.json() as unknown }
    } catch {
      if (callerSignal?.aborted) throw abortReason(callerSignal)
      if (timedOut) throw interceptApiError(new ApiError(408, 'The control service request timed out. Retry the request.'), context)
      throw interceptApiError(new ApiError(502, 'The control service returned an invalid response.'), context)
    }
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener('abort', cancel)
  }
}
