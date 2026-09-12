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

  it('requests bounded identity pages with the backend cursor and filter', async () => {
    const identity = {
      credential_id: '11111111-1111-4111-8111-111111111111', s3_access_key: 'ACCESS_ONE', azure_account: 'accountone',
      access_mode: 'direct' as const, use_managed_identity: true, versioning_enabled: false, default_backend_id: null,
      enabled: true, virtual_bucket_count: 0, policy_attachment_count: 0,
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [identity], next_after_id: identity.credential_id, default_page_size: 100, max_page_size: 200 }))
      .mockResolvedValueOnce(Response.json({ items: [], next_after_id: null, default_page_size: 100, max_page_size: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const firstQuery = controlQueries.identityPage(null, 'direct').queryFn
    if (typeof firstQuery !== 'function') throw new Error('Expected identity page query function')
    const firstPage = await firstQuery({} as never)
    const secondQuery = controlQueries.identityPage(firstPage.next_after_id, 'direct').queryFn
    if (typeof secondQuery !== 'function') throw new Error('Expected identity page query function')
    const secondPage = await secondQuery({} as never)

    expect(firstPage.items).toEqual([identity])
    expect(firstPage.next_after_id).toBe(identity.credential_id)
    expect(secondPage.items).toEqual([])
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/admin/ui/identity-pages?limit=100&access_mode=direct',
      `/admin/ui/identity-pages?limit=100&after_id=${identity.credential_id}&access_mode=direct`,
    ])
  })

  it('propagates a missing identity page endpoint without requesting the full inventory', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 'NotFound' }, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const query = controlQueries.identityPage(null, null).queryFn
    if (typeof query !== 'function') throw new Error('Expected identity page query function')

    await expect(query({} as never)).rejects.toMatchObject({ status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/admin/ui/identity-pages?limit=100', expect.any(Object))
  })

  it('rejects identity pages larger than the requested bound', async () => {
    const items = Array.from({ length: 101 }, (_, index) => ({ credential_id: String(index) }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items, next_after_id: null })))
    const query = controlQueries.identityPage(null, null).queryFn
    if (typeof query !== 'function') throw new Error('Expected identity page query function')

    await expect(query({} as never)).rejects.toThrow('Invalid identity page response')
  })

  it('pages backend options and resolves off-page selections by stable ID', async () => {
    const backend = { id: '11111111-1111-4111-8111-111111111111', name: 'primary', azure_account: 'accountone', auth_mode: 'managed_identity' as const, enabled: true }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [backend], next_after_id: backend.id, default_page_size: 100, max_page_size: 200 }))
      .mockResolvedValueOnce(Response.json({ items: [], next_after_id: null, default_page_size: 100, max_page_size: 200 }))
      .mockResolvedValueOnce(Response.json(backend))
    vi.stubGlobal('fetch', fetchMock)

    const firstQuery = controlQueries.backendOptionPage(null).queryFn
    const secondQuery = controlQueries.backendOptionPage(backend.id).queryFn
    const detailQuery = controlQueries.backendOption(backend.id).queryFn
    if (typeof firstQuery !== 'function' || typeof secondQuery !== 'function' || typeof detailQuery !== 'function') throw new Error('Expected backend option query functions')
    await firstQuery({} as never)
    await secondQuery({} as never)
    await detailQuery({} as never)

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/admin/ui/backend-options?limit=100',
      `/admin/ui/backend-options?limit=100&after_id=${backend.id}`,
      `/admin/ui/backend-options/${backend.id}`,
    ])
  })

  it('rejects backend option pages larger than the requested bound', async () => {
    const items = Array.from({ length: 101 }, (_, index) => ({ id: String(index) }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items, next_after_id: null })))
    const query = controlQueries.backendOptionPage(null).queryFn
    if (typeof query !== 'function') throw new Error('Expected backend option page query function')

    await expect(query({} as never)).rejects.toThrow('Invalid backend option page response')
  })
})