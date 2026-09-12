import { ApiError, requestTransport, setCsrfToken } from './client'
import { operationMetadata, type OperationId } from './generated/operations'
import { responseValidators } from './generated/validators.js'
import type { operations as OpenApiOperations } from './schema'
import type { paths } from './schema'

export type LoginResponse = paths['/admin/session/login']['post']['responses']['200']['content']['application/json']
export type SessionResponse = paths['/admin/session']['get']['responses']['200']['content']['application/json']

type Operation<Id extends OperationId> = OpenApiOperations[Id]
type RawParameters<Id extends OperationId> = Operation<Id> extends { parameters: infer Parameters } ? Parameters : never
type DefinedParameters<Parameters> = {
  [Key in keyof Parameters as Exclude<Parameters[Key], undefined> extends never ? never : Key]: Parameters[Key]
}
type ParameterInput<Id extends OperationId> = keyof DefinedParameters<RawParameters<Id>> extends never
  ? { parameters?: never }
  : {} extends DefinedParameters<RawParameters<Id>>
    ? { parameters?: DefinedParameters<RawParameters<Id>> }
    : { parameters: DefinedParameters<RawParameters<Id>> }
type RequestBody<Id extends OperationId> = Operation<Id> extends {
  requestBody: { content: { 'application/json': infer Body } }
} ? Body : never
type BodyInput<Id extends OperationId> = [RequestBody<Id>] extends [never]
  ? { body?: never }
  : { body: RequestBody<Id> }
type Responses<Id extends OperationId> = Operation<Id> extends { responses: infer Result } ? Result : never
type SuccessKey<Key> = Key extends string | number ? `${Key}` extends `2${string}` ? Key : never : never
type SuccessResponse<Id extends OperationId> = Responses<Id>[SuccessKey<keyof Responses<Id>>]
type JsonResult<Response> = Response extends { content: { 'application/json': infer Value } } ? Value : never
type OperationResult<Id extends OperationId> = [JsonResult<SuccessResponse<Id>>] extends [never]
  ? void
  : JsonResult<SuccessResponse<Id>>

export type OperationInput<Id extends OperationId> = ParameterInput<Id> & BodyInput<Id> & {
  signal?: AbortSignal
}

function records(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function operationPath(template: string, parameters: unknown) {
  const pathParameters = records(records(parameters).path)
  return template.replaceAll(/\{([^}]+)\}/g, (_, name: string) => {
    const value = pathParameters[name]
    if (value === undefined) throw new Error(`Missing path parameter: ${name}`)
    return encodeURIComponent(String(value))
  })
}

function operationQuery(parameters: unknown) {
  const query = records(records(parameters).query)
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) value.forEach(item => search.append(name, String(item)))
    else search.set(name, String(value))
  }
  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

function invalidResponse(): ApiError {
  return new ApiError(502, 'The control service returned an invalid response.')
}

export async function invokeOperation<Id extends OperationId>(
  operationId: Id,
  input: OperationInput<Id>,
): Promise<OperationResult<Id>> {
  const metadata = operationMetadata[operationId]
  const path = operationPath(metadata.path, input.parameters) + operationQuery(input.parameters)
  const init: RequestInit = { method: metadata.method, signal: input.signal }
  if ('body' in input && input.body !== undefined) init.body = JSON.stringify(input.body)
  const response = await requestTransport(path, init)
  const success = metadata.successes.find(candidate => candidate.status === response.status)
  if (!success) throw invalidResponse()
  if (success.kind === 'empty') {
    if (response.value !== undefined) throw invalidResponse()
    return undefined as OperationResult<Id>
  }
  const validator = responseValidators[operationId]?.[response.status]
  if (!validator || !validator(response.value)) throw invalidResponse()
  return response.value as OperationResult<Id>
}

function invalidSessionResponse(): ApiError {
  return new ApiError(502, 'The control service returned an invalid session response.')
}

function parseSessionCredentials(value: LoginResponse): LoginResponse {
  if (value.csrf_token.trim() === '' || !Number.isFinite(Date.parse(value.expires_at))) throw invalidSessionResponse()
  return value
}

export async function login(apiKey: string): Promise<LoginResponse> {
  return parseSessionCredentials(await invokeOperation('login', { body: { api_key: apiKey } }))
}

export async function getSession(signal?: AbortSignal): Promise<SessionResponse> {
  const value = await invokeOperation('getSession', { signal })
  if (!value.authenticated) return { authenticated: false, csrf_token: '', expires_at: '' }
  return { authenticated: true, ...parseSessionCredentials(value) }
}

export async function logout() {
  await invokeOperation('logout', {})
  setCsrfToken(null)
}