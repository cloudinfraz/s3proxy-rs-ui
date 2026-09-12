import { invokeOperation } from './operations'
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
  if (path === '/admin/credentials' || path === '/admin/policies') {
    const envelope = response as CredentialList | PolicyList
    if (!Number.isInteger(envelope.count) || envelope.count !== rows.length) throw new Error('Invalid resource collection response')
  }
  return rows.map(row => ({ ...row }))
}

export async function fetchResourceRows<P extends ResourceListPath>(path: P, signal?: AbortSignal): Promise<ResourceRow[]> {
  if (path === '/admin/credentials') return normalizeResourceRows('/admin/credentials', await invokeOperation('listCredentials', { signal }))
  if (path === '/admin/virtual-buckets') return normalizeResourceRows('/admin/virtual-buckets', await invokeOperation('listVirtualBuckets', { signal }))
  if (path === '/admin/backends') return normalizeResourceRows('/admin/backends', await invokeOperation('listBackends', { signal }))
  if (path === '/admin/policies') return normalizeResourceRows('/admin/policies', await invokeOperation('listPolicies', { signal }))
  return normalizeResourceRows('/admin/api-keys', await invokeOperation('listAdminKeys', { signal }))
}