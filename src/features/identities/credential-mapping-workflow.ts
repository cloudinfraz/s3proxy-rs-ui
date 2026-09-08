const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export const virtualIdentityCreationPath = '/credentials?create=virtual&return=buckets'

export function requestsVirtualIdentity(params: URLSearchParams): boolean {
  return params.size === 2 && params.get('create') === 'virtual' && params.get('return') === 'buckets'
}

export function requestedMappingIdentity(params: URLSearchParams): string | null {
  const credentialId = params.get('identity')
  return params.size === 2 && params.get('create') === 'mapping' && credentialId && UUID_PATTERN.test(credentialId)
    ? credentialId
    : null
}

export function mappingCreationPath(credentialId: string): string | null {
  return UUID_PATTERN.test(credentialId)
    ? `/buckets?create=mapping&identity=${encodeURIComponent(credentialId)}`
    : null
}