import { queryOptions } from '@tanstack/react-query'
import { api } from './client'
import type { components } from './schema'
import { controlKeys } from './query-keys'
import { auditLimit } from '../features/operations/state'

export type Schema = components['schemas']

export function envelopeRows<Row>(response: { count: number; items: Row[] }): Row[] {
  if (!response || !Array.isArray(response.items) || !Number.isInteger(response.count) || response.count !== response.items.length) {
    throw new Error('Invalid resource collection response')
  }
  return response.items
}

export function arrayRows<Row>(response: Row[]): Row[] {
  if (!Array.isArray(response)) throw new Error('Invalid resource collection response')
  return response
}

export const controlQueries = {
  identities: queryOptions({ queryKey: controlKeys.list('identities'), queryFn: async () => envelopeRows(await api<Schema['IdentityProjectionListResponse']>('/admin/ui/identities')) }),
  identityPage: (afterId: string | null, accessMode: 'direct' | null) => queryOptions({
    queryKey: controlKeys.identityPage(afterId, accessMode),
    queryFn: async () => {
      const response = await api<Schema['IdentityProjectionPage']>(`/admin/ui/identity-pages?limit=100${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ''}${accessMode ? `&access_mode=${accessMode}` : ''}`)
      if (!Array.isArray(response.items) || response.items.length > 100 || !(response.next_after_id === null || typeof response.next_after_id === 'string')) throw new Error('Invalid identity page response')
      return response
    },
  }),
  policies: queryOptions({ queryKey: controlKeys.list('policies'), queryFn: async () => envelopeRows(await api<Schema['PolicyListResponse']>('/admin/policies')) }),
  buckets: queryOptions({ queryKey: controlKeys.list('buckets'), queryFn: async () => arrayRows(await api<Schema['VirtualBucketList']>('/admin/virtual-buckets')) }),
  backends: queryOptions({ queryKey: controlKeys.list('backends'), queryFn: async () => envelopeRows(await api<Schema['StorageBackendProjectionListResponse']>('/admin/ui/backends')) }),
  keys: queryOptions({ queryKey: controlKeys.list('keys'), queryFn: async () => arrayRows(await api<Schema['AdminApiKeyList']>('/admin/api-keys')) }),
  roles: queryOptions({ queryKey: controlKeys.list('roles'), queryFn: async () => {
    const response = await api<Schema['AdminIamRolePage']>('/admin/ui/roles?limit=100')
    if (!response || !Array.isArray(response.items) || response.items.length > 100 || !(response.next_after_id === null || typeof response.next_after_id === 'string')) throw new Error('Invalid role page response')
    return response
  } }),
  capabilities: queryOptions({ queryKey: controlKeys.capabilities, queryFn: () => api<Schema['ControlCapabilities']>('/admin/capabilities') }),
  health: queryOptions({ queryKey: controlKeys.health, queryFn: () => api<Schema['AdminHealthResponse']>('/admin/health') }),
  audit: (limit: number) => queryOptions({ queryKey: controlKeys.audit(auditLimit(limit)), queryFn: async () => arrayRows(await api<Schema['AuditEventList']>(`/admin/audit?limit=${auditLimit(limit)}`)) }),
}