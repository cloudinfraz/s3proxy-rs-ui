import { describe, expect, it } from 'vitest'
import { mappingCreationPath, requestedMappingIdentity, requestsVirtualIdentity, virtualIdentityCreationPath } from './credential-mapping-workflow'

const credentialId = '11111111-1111-4111-8111-111111111111'

describe('credential mapping workflow', () => {
  it('accepts only the allowlisted virtual identity creation intent', () => {
    expect(requestsVirtualIdentity(new URLSearchParams('create=virtual&return=buckets'))).toBe(true)
    expect(requestsVirtualIdentity(new URLSearchParams('create=direct&return=buckets'))).toBe(false)
    expect(requestsVirtualIdentity(new URLSearchParams('create=virtual&return=https://example.test'))).toBe(false)
    expect(requestsVirtualIdentity(new URLSearchParams('create=virtual&return=buckets&secret=unsafe'))).toBe(false)
    expect(virtualIdentityCreationPath).toBe('/credentials?create=virtual&return=buckets')
  })

  it('carries only a valid credential UUID into mapping creation', () => {
    const path = mappingCreationPath(credentialId)
    expect(path).toBe(`/buckets?create=mapping&identity=${credentialId}`)
    expect(requestedMappingIdentity(new URLSearchParams(path?.split('?')[1]))).toBe(credentialId)
    expect(mappingCreationPath('not-a-uuid')).toBeNull()
    expect(mappingCreationPath('018f6b5c-7c9a-7d2e-8f31-4b2c6d8e9f10')).not.toBeNull()
    expect(requestedMappingIdentity(new URLSearchParams('create=mapping&identity=not-a-uuid'))).toBeNull()
    expect(requestedMappingIdentity(new URLSearchParams(`create=mapping&identity=${credentialId}&extra=unsafe`))).toBeNull()
  })
})