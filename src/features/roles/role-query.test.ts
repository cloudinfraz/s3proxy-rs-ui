import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi, type Mock } from 'vitest'
import { invokeOperation } from '../../api/operations'
import { controlQueries } from '../../api/control'

vi.mock('../../api/operations', () => ({ invokeOperation: vi.fn() }))
const api = invokeOperation as unknown as Mock<(operationId: string, input?: OperationMockInput) => Promise<unknown>>
type OperationMockInput = { parameters?: { path?: Record<string, string>; query?: Record<string, unknown> }; body?: unknown; signal?: AbortSignal }
afterEach(() => vi.resetAllMocks())

it('requests safe bounded role metadata for the overview without the legacy trust document', async () => {
  const page = { items: [], next_after_id: null }
  vi.mocked(api).mockResolvedValue(page)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  expect(await client.fetchQuery(controlQueries.roles)).toEqual(page)
  expect(api).toHaveBeenCalledExactlyOnceWith('listAdminRoles', { parameters: { query: { limit: 100 } }, signal: expect.any(AbortSignal) })
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