import { describe, expect, it } from 'vitest'
import { createMappingPayload, draftError, effectiveTarget, listingTemplates, mappingDraft, reviewedRoutingContext, updateMappingPayload, type Backend, type Identity, type Mapping, type RoutingContext } from './routing'

const identity: Identity = { credential_id: 'owner', s3_access_key: 'SYNTHETIC', azure_account: 'legacyaccount', access_mode: 'virtual', enabled: true, default_backend_id: 'default', use_managed_identity: true, versioning_enabled: true, virtual_bucket_count: 1, policy_attachment_count: 0 }
const backend: Backend = { id: 'default', name: 'primary', azure_account: 'primaryaccount', auth_mode: 'managed_identity', managed_identity_client_id: null, enabled: true, has_secret_ref: false, user_delegation_sas_enabled: true, region_label: null, credential_default_count: 1, virtual_bucket_count: 0, impact_token: 'a'.repeat(32) }
const context: RoutingContext = { identities: [identity], backends: [backend, { ...backend, id: 'override', azure_account: 'otheraccount' }], capabilities: { plane: 'control', authz_mode: 'enforce', sts_enabled: false, iam_assume_role_enabled: false, assume_role_ready: false, iam_account_configured: false, backend_routing_enabled: true, usable_registry_auth_modes: ['managed_identity'], legacy_routing_available: true, public_s3_endpoint: null, public_sts_endpoint: null } }
const mapping: Mapping = { id: 'mapping', virtual_bucket_name: 'reports-alias', azure_container: 'reports-physical', credential_id: 'owner', backend_id: 'override', endpoint_prefix: 'reports', enabled: true, created_at: '', updated_at: '', credential_default_backend_id: 'default', impact_token: 'a'.repeat(32) }

describe('effective routing', () => {
  it('uses the reviewed owner default without mutating cached identity metadata', () => {
    const reviewed = reviewedRoutingContext(context, { ...mapping, credential_default_backend_id: 'override' })
    expect(effectiveTarget(reviewed.identities[0], null, reviewed).account).toBe('otheraccount')
    expect(context.identities[0].default_backend_id).toBe('default')
    expect(reviewedRoutingContext(context, null)).toBe(context)
    const cleared = reviewedRoutingContext(context, { ...mapping, credential_default_backend_id: null })
    expect(effectiveTarget(cleared.identities[0], null, cleared).source).toBe('Legacy account')
  })
  it('applies override, default and legacy precedence without merging accounts', () => {
    expect(effectiveTarget(identity, 'override', context)).toMatchObject({ source: 'Mapping override', account: 'otheraccount' })
    expect(effectiveTarget(identity, null, context)).toMatchObject({ source: 'Identity default', account: 'primaryaccount' })
    expect(effectiveTarget({ ...identity, default_backend_id: null }, null, context)).toMatchObject({ source: 'Legacy account', account: 'legacyaccount' })
    expect(effectiveTarget(identity, 'missing', { ...context, capabilities: { ...context.capabilities, backend_routing_enabled: false } })).toMatchObject({ source: 'Legacy account', account: 'legacyaccount' })
  })
  it('blocks missing, disabled or unsupported selected backends without fallback', () => {
    expect(effectiveTarget(identity, 'missing', context).blocked).toContain('missing')
    for (const selected of [{ ...backend, enabled: false }, { ...backend, auth_mode: 'account_key' as const }]) {
      expect(effectiveTarget(identity, null, { ...context, backends: [selected] }).blocked).toBeTruthy()
    }
    expect(effectiveTarget(undefined, null, context).blocked).toBeTruthy()
    expect(effectiveTarget({ ...identity, enabled: false }, null, context).blocked).toContain('disabled')
  })
})

describe('mapping payloads', () => {
  it('preserves omitted fields and explicitly clears inherited fields', () => {
    expect(updateMappingPayload(mappingDraft(mapping), mapping)).toEqual({ expected_impact_token: mapping.impact_token })
    expect(updateMappingPayload({ ...mappingDraft(mapping), backend: '', prefix: '', enabled: false }, mapping)).toEqual({ expected_impact_token: mapping.impact_token, backend_id: null, endpoint_prefix: null, enabled: false })
    expect(updateMappingPayload({ ...mappingDraft(mapping), backend: 'default' }, mapping, 4)).toEqual({ expected_impact_token: mapping.impact_token, backend_id: 'default', expected_backend_revision: 4 })
    expect(createMappingPayload(mappingDraft(mapping), 4)).toMatchObject({ virtual_bucket_name: 'reports-alias', azure_container: 'reports-physical', expected_backend_revision: 4 })
  })
  it('validates independent alias/container and virtual ownership without normalizing', () => {
    expect(draftError(mappingDraft(mapping), context)).toBeUndefined()
    for (const alias of ['a.b', 'with--hyphens', ' Uppercase', 'a'.repeat(64)]) expect(draftError({ ...mappingDraft(mapping), alias }, context)).toBeTruthy()
    for (const container of ['ab', 'a.b', 'with--hyphens', 'container\n']) expect(draftError({ ...mappingDraft(mapping), container }, context)).toBeTruthy()
    for (const prefix of ['https://host', 'a.b', 'label\n']) expect(draftError({ ...mappingDraft(mapping), prefix }, context)).toBeTruthy()
    expect(draftError(mappingDraft(mapping), { ...context, identities: [{ ...identity, access_mode: 'direct' }] })).toContain('virtual')
    expect(draftError({ ...mappingDraft(mapping), alias: 'another-alias' }, context, mapping)).toContain('cannot change')
  })
})

it('produces escaped list-only templates with default signing and TLS', () => {
  expect(listingTemplates(null)).toBeUndefined()
  for (const endpoint of ['file:///tmp', 'https://user:password@example.test', 'https://example.test?sig=synthetic', ' https://example.test', 'https://example.test\n']) expect(listingTemplates(endpoint)).toBeUndefined()
  const templates = listingTemplates('https://s3.example.test/with\'quote')!
  expect(templates.cli).toContain("'\\''")
  expect(templates.javascript).toContain('forcePathStyle: true')
  expect(templates.cli).toContain('addressing_style = path')
  expect(templates.javascript).toContain('ListObjectsV2Command')
  expect(JSON.stringify(templates)).not.toMatch(/no-sign|no-verify|rejectUnauthorized|secretAccessKey|CreateBucket|Delete|recursive/)
})