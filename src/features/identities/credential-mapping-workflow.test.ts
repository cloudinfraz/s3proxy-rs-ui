import { describe, expect, it } from 'vitest'
import { isNonBlank, isValidCredentialId, mappingCreationPath, requestedMappingIdentity, requestsVirtualIdentity, virtualIdentityCreationPath } from './credential-mapping-workflow'

const credentialId = '11111111-1111-4111-8111-111111111111'

describe('credential mapping workflow', () => {
  it('validates non-blank values and credential UUIDs at external boundaries', () => {
    expect(isNonBlank(' value ')).toBe(true)
    expect(isNonBlank('   ')).toBe(false)
    expect(isNonBlank(undefined)).toBe(false)
    expect(isValidCredentialId(credentialId)).toBe(true)
    expect(isValidCredentialId('   ')).toBe(false)
    expect(isValidCredentialId('not-a-uuid')).toBe(false)
  })

  it('accepts only the allowlisted virtual identity creation intent', () => {
    expect(requestsVirtualIdentity(new URLSearchParams('create=virtual&return=buckets'))).toBe(true)
    expect(requestsVirtualIdentity(new URLSearchParams('create=direct&return=buckets'))).toBe(false)
    expect(requestsVirtualIdentity(new URLSearchParams('create=virtual&return=https://example.test'))).toBe(false)
    expect(requestsVirtualIdentity(new URLSearchParams('create=virtual&return=buckets&secret=unsafe'))).toBe(false)
    expect(requestsVirtualIdentity(new URLSearchParams('create=virtual&create=virtual'))).toBe(false)
    expect(virtualIdentityCreationPath).toBe('/credentials?create=virtual&return=buckets')
  })

  it('carries only a valid credential UUID into mapping creation', () => {
    const path = mappingCreationPath(credentialId)
    expect(path).toBe(`/buckets?create=mapping&credential_id=${credentialId}`)
    expect(requestedMappingIdentity(new URLSearchParams(path?.split('?')[1]))).toBe(credentialId)
    expect(mappingCreationPath('not-a-uuid')).toBeNull()
    expect(mappingCreationPath('   ')).toBeNull()
    expect(mappingCreationPath('018f6b5c-7c9a-7d2e-8f31-4b2c6d8e9f10')).not.toBeNull()
    expect(requestedMappingIdentity(new URLSearchParams('create=mapping&credential_id=not-a-uuid'))).toBeNull()
    expect(requestedMappingIdentity(new URLSearchParams(`create=mapping&credential_id=${credentialId}&extra=unsafe`))).toBeNull()
    expect(requestedMappingIdentity(new URLSearchParams(`create=mapping&credential_id=${credentialId}&secret=unsafe`))).toBeNull()
    expect(requestedMappingIdentity(new URLSearchParams(`create=mapping&credential_id=${credentialId}&credential_id=${credentialId}`))).toBeNull()
  })
})