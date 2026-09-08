const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export const virtualIdentityCreationPath = '/credentials?create=virtual&return=buckets'

export function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isValidCredentialId(value: unknown): value is string {
  return isNonBlank(value) && UUID_PATTERN.test(value)
}

function hasExactParams(params: URLSearchParams, names: readonly string[]): boolean {
  return params.size === names.length && names.every(name => params.getAll(name).length === 1)
}

export function requestsVirtualIdentity(params: URLSearchParams): boolean {
  return hasExactParams(params, ['create', 'return'])
    && params.get('create') === 'virtual'
    && params.get('return') === 'buckets'
}

export function requestedMappingIdentity(params: URLSearchParams): string | null {
  const credentialId = params.get('credential_id')
  return hasExactParams(params, ['create', 'credential_id'])
    && params.get('create') === 'mapping'
    && isValidCredentialId(credentialId)
    ? credentialId
    : null
}

export function mappingCreationPath(credentialId: string): string | null {
  return isValidCredentialId(credentialId)
    ? `/buckets?create=mapping&credential_id=${encodeURIComponent(credentialId)}`
    : null
}