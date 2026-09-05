import { api } from './client'
import type { paths } from './schema'

type CredentialList = paths['/admin/credentials']['get']['responses']['200']['content']['application/json']
type VirtualBucketList = paths['/admin/virtual-buckets']['get']['responses']['200']['content']['application/json']
type StorageBackendList = paths['/admin/backends']['get']['responses']['200']['content']['application/json']
type PolicyList = paths['/admin/policies']['get']['responses']['200']['content']['application/json']
type AdminApiKeyList = paths['/admin/api-keys']['get']['responses']['200']['content']['application/json']

export type ResourceRow = Record<string, unknown>
export type ResourceListPath = keyof ResourceListResponses

type ResourceListResponses = {
  '/admin/credentials': CredentialList
  '/admin/virtual-buckets': VirtualBucketList
  '/admin/backends': StorageBackendList
  '/admin/policies': PolicyList
  '/admin/api-keys': AdminApiKeyList
}

export function normalizeResourceRows<P extends ResourceListPath>(
  path: P,
  response: ResourceListResponses[P],
): ResourceRow[] {
  const rows = path === '/admin/credentials' || path === '/admin/policies'
    ? (response as CredentialList | PolicyList).items
    : response as VirtualBucketList | StorageBackendList | AdminApiKeyList

  if (!Array.isArray(rows)) throw new Error('Invalid resource collection response')
  return rows.map(row => ({ ...row }))
}

export async function fetchResourceRows<P extends ResourceListPath>(path: P): Promise<ResourceRow[]> {
  const response = await api<ResourceListResponses[P]>(path)
  return normalizeResourceRows(path, response)
}