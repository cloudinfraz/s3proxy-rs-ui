import { afterEach, describe, expect, it, vi } from 'vitest'
import { arrayRows, envelopeRows, controlQueries } from './control'

afterEach(() => { vi.unstubAllGlobals() })

describe('typed read boundaries', () => {
  it('preserves arrays and exact envelope counts including empty results', () => {
    expect(envelopeRows({ count: 1, items: ['row'] })).toEqual(['row'])
    expect(envelopeRows({ count: 0, items: [] })).toEqual([])
    expect(arrayRows(['row'])).toEqual(['row'])
  })
  it('rejects missing items, mismatched counts and invalid arrays', () => {
    for (const response of [{ count: 0 }, { count: 1, items: [] }, null]) {
      expect(() => envelopeRows(response as { count: number; items: string[] })).toThrow('Invalid resource collection response')
    }
    expect(() => arrayRows({} as string[])).toThrow()
    expect(() => controlQueries.audit(201)).toThrow()
  })

  it('falls back to the legacy identity inventory when pagination is unavailable', async () => {
    const identity = {
      credential_id: '11111111-1111-4111-8111-111111111111', s3_access_key: 'ACCESS_000', azure_account: 'accountone',
      access_mode: 'direct' as const, use_managed_identity: true, versioning_enabled: false, default_backend_id: null,
      enabled: true, virtual_bucket_count: 0, policy_attachment_count: 0,
    }
    const identities = Array.from({ length: 101 }, (_, index) => ({
      ...identity,
      credential_id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
      s3_access_key: `ACCESS_${String(index).padStart(3, '0')}`,
    }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(Response.json({ count: identities.length, items: identities }))
      .mockResolvedValueOnce(Response.json({ count: identities.length, items: identities }))
    vi.stubGlobal('fetch', fetchMock)

    const firstQuery = controlQueries.identityPage(null, 'direct').queryFn
    if (typeof firstQuery !== 'function') throw new Error('Expected identity page query function')
    const firstPage = await firstQuery({} as never)
    const secondQuery = controlQueries.identityPage(firstPage.next_after_id, 'direct').queryFn
    if (typeof secondQuery !== 'function') throw new Error('Expected identity page query function')
    const secondPage = await secondQuery({} as never)

    expect(firstPage.items).toHaveLength(100)
    expect(firstPage.next_after_id).toBe('legacy-offset:100')
    expect(secondPage).toEqual({ items: [identities[100]], next_after_id: null, default_page_size: 100, max_page_size: 200 })
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/admin/ui/identity-pages?limit=100&access_mode=direct',
      '/admin/ui/identities',
      '/admin/ui/identities',
    ])
  })
})