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

const identityPageSize = 100
const backendOptionPageSize = 100

export const controlQueries = {
  identityPage: (afterId: string | null, accessMode: 'direct' | 'virtual' | null) => queryOptions({
    queryKey: controlKeys.identityPage(afterId, accessMode),
    queryFn: async () => {
      const response = await api<Schema['IdentityProjectionPage']>(`/admin/ui/identity-pages?limit=${identityPageSize}${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ''}${accessMode ? `&access_mode=${accessMode}` : ''}`)
      if (!Array.isArray(response.items) || response.items.length > identityPageSize || !(response.next_after_id === null || typeof response.next_after_id === 'string')) throw new Error('Invalid identity page response')
      return response
    },
  }),
  identity: (credentialId: string) => queryOptions({ queryKey: controlKeys.detail('identities', credentialId), queryFn: () => api<Schema['IdentityProjection']>(`/admin/ui/identities/${encodeURIComponent(credentialId)}`) }),
  backendOptionPage: (afterId: string | null) => queryOptions({
    queryKey: controlKeys.backendOptionPage(afterId),
    queryFn: async () => {
      const response = await api<Schema['StorageBackendOptionPage']>(`/admin/ui/backend-options?limit=${backendOptionPageSize}${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ''}`)
      if (!Array.isArray(response.items) || response.items.length > backendOptionPageSize || !(response.next_after_id === null || typeof response.next_after_id === 'string')) throw new Error('Invalid backend option page response')
      return response
    },
  }),
  backendOption: (backendId: string) => queryOptions({ queryKey: controlKeys.backendOption(backendId), queryFn: () => api<Schema['StorageBackendOption']>(`/admin/ui/backend-options/${encodeURIComponent(backendId)}`) }),
  overview: queryOptions({ queryKey: controlKeys.overview, queryFn: () => api<Schema['AdminOverviewSummary']>('/admin/ui/overview') }),
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