import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import { controlQueries } from '../../api/control'

vi.mock('../../api/client', () => ({ api: vi.fn() }))
afterEach(() => vi.resetAllMocks())

it('requests safe bounded role metadata for the overview without the legacy trust document', async () => {
  const page = { items: [], next_after_id: null }
  vi.mocked(api).mockResolvedValue(page)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  expect(await client.fetchQuery(controlQueries.roles)).toEqual(page)
  expect(api).toHaveBeenCalledExactlyOnceWith('/admin/ui/roles?limit=100')
  client.clear()
})

it('rejects malformed or unbounded role pages', async () => {
  for (const page of [{ items: {}, next_after_id: null }, { items: [], next_after_id: 1 }, { items: Array(101).fill({}), next_after_id: null }]) {
    vi.mocked(api).mockResolvedValue(page)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await expect(client.fetchQuery(controlQueries.roles)).rejects.toThrow('Invalid role page')
    client.clear()
  }
})