import { queryOptions } from '@tanstack/react-query'
import type { components } from './schema'
import { controlKeys } from './query-keys'
import { auditLimit } from './parameters'
import { invokeOperation } from './operations'

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
    queryFn: async ({ signal }) => {
      const response = await invokeOperation('listIdentityProjectionPage', { parameters: { query: { limit: identityPageSize, after_id: afterId ?? undefined, access_mode: accessMode ?? undefined } }, signal })
      if (!Array.isArray(response.items) || response.items.length > identityPageSize || !(response.next_after_id === null || typeof response.next_after_id === 'string')) throw new Error('Invalid identity page response')
      return response
    },
  }),
  identity: (credentialId: string) => queryOptions({ queryKey: controlKeys.detail('identities', credentialId), queryFn: ({ signal }) => invokeOperation('getIdentityProjection', { parameters: { path: { credential_id: credentialId } }, signal }) }),
  backendOptionPage: (afterId: string | null) => queryOptions({
    queryKey: controlKeys.backendOptionPage(afterId),
    queryFn: async ({ signal }) => {
      const response = await invokeOperation('listBackendOptions', { parameters: { query: { limit: backendOptionPageSize, after_id: afterId ?? undefined } }, signal })
      if (!Array.isArray(response.items) || response.items.length > backendOptionPageSize || !(response.next_after_id === null || typeof response.next_after_id === 'string')) throw new Error('Invalid backend option page response')
      return response
    },
  }),
  backendOption: (backendId: string) => queryOptions({ queryKey: controlKeys.backendOption(backendId), queryFn: ({ signal }) => invokeOperation('getBackendOption', { parameters: { path: { backend_id: backendId } }, signal }) }),
  overview: queryOptions({ queryKey: controlKeys.overview, queryFn: ({ signal }) => invokeOperation('getAdminOverview', { signal }) }),
  policies: queryOptions({ queryKey: controlKeys.list('policies'), queryFn: async ({ signal }) => envelopeRows(await invokeOperation('listPolicies', { signal })) }),
  buckets: queryOptions({ queryKey: controlKeys.list('buckets'), queryFn: async ({ signal }) => arrayRows(await invokeOperation('listVirtualBuckets', { signal })) }),
  backends: queryOptions({ queryKey: controlKeys.list('backends'), queryFn: async ({ signal }) => envelopeRows(await invokeOperation('listBackendProjections', { signal })) }),
  keys: queryOptions({ queryKey: controlKeys.list('keys'), queryFn: async ({ signal }) => arrayRows(await invokeOperation('listAdminKeys', { signal })) }),
  roles: queryOptions({ queryKey: controlKeys.list('roles'), queryFn: async ({ signal }) => {
    const response = await invokeOperation('listAdminRoles', { parameters: { query: { limit: 100 } }, signal })
    if (!response || !Array.isArray(response.items) || response.items.length > 100 || !(response.next_after_id === null || typeof response.next_after_id === 'string')) throw new Error('Invalid role page response')
    return response
  } }),
  capabilities: queryOptions({ queryKey: controlKeys.capabilities, queryFn: ({ signal }) => invokeOperation('getCapabilities', { signal }) }),
  health: queryOptions({ queryKey: controlKeys.health, queryFn: ({ signal }) => invokeOperation('adminHealth', { signal }) }),
  audit: (limit: number) => queryOptions({ queryKey: controlKeys.audit(auditLimit(limit)), queryFn: async ({ signal }) => arrayRows(await invokeOperation('listAuditEvents', { parameters: { query: { limit: auditLimit(limit) } }, signal })) }),
}