import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setCsrfToken } from './client'
import { invokeOperation } from './operations'

const json = (body: unknown, status = 200) => Response.json(body, { status })
const overview = { identity_count: 1, bucket_routing_count: 2, backend_count: 3, policy_count: 4 }
const identity = {
  credential_id: '11111111-1111-4111-8111-111111111111', s3_access_key: 'synthetic-access', azure_account: 'account',
  access_mode: 'direct' as const, use_managed_identity: true, versioning_enabled: false, default_backend_id: null,
  enabled: true, virtual_bucket_count: 0, policy_attachment_count: 0,
}

afterEach(() => {
  setCsrfToken(null)
  vi.unstubAllGlobals()
})

describe('OpenAPI operation facade', () => {
  it('returns runtime-validated object and page responses', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json(overview))
      .mockResolvedValueOnce(json({ items: [identity], next_after_id: null, default_page_size: 100, max_page_size: 200 })))

    await expect(invokeOperation('getAdminOverview', {})).resolves.toEqual(overview)
    await expect(invokeOperation('listIdentityProjectionPage', { parameters: { query: { limit: 100 } } })).resolves.toMatchObject({ items: [identity] })
    expect(vi.mocked(fetch).mock.calls.map(([path]) => path)).toEqual([
      '/admin/ui/overview',
      '/admin/ui/identity-pages?limit=100',
    ])
  })

  it.each([
    { ...overview, identity_count: 'invalid' },
    { ...overview, unexpected: 'forbidden' },
    null,
  ])('rejects malformed successful data without exposing it', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)))
    const error = await invokeOperation('getAdminOverview', {}).catch(cause => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 502, message: 'The control service returned an invalid response.' })
    expect(String(error)).not.toContain('forbidden')
  })

  it('rejects malformed nested page data and undocumented success statuses', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ items: [{ ...identity, enabled: 'yes' }], next_after_id: null, default_page_size: 100, max_page_size: 200 }))
      .mockResolvedValueOnce(json(overview, 201)))

    await expect(invokeOperation('listIdentityProjectionPage', {})).rejects.toMatchObject({ status: 502 })
    await expect(invokeOperation('getAdminOverview', {})).rejects.toMatchObject({ status: 502 })
  })

  it('accepts documented no-content and rejects a body-bearing success status', async () => {
    setCsrfToken('csrf')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({}, 200)))

    await expect(invokeOperation('logout', {})).resolves.toBeUndefined()
    await expect(invokeOperation('logout', {})).rejects.toMatchObject({ status: 502 })
  })
})
