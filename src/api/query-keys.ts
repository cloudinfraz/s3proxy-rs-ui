import type { QueryClient } from '@tanstack/react-query'

export type ControlResource = 'identities' | 'buckets' | 'backends' | 'policies' | 'keys' | 'roles'

export const controlKeys = {
  all: ['control'] as const,
  session: ['session'] as const,
  capabilities: ['control', 'capabilities'] as const,
  overview: ['control', 'overview'] as const,
  readiness: ['control', 'readiness'] as const,
  readinessPage: (afterKey: string | null) => ['control', 'readiness', 'page', { afterKey }] as const,
  health: ['control', 'health'] as const,
  list: (resource: ControlResource) => ['control', resource, 'list'] as const,
  identityPage: (afterId: string | null, accessMode: 'direct' | 'virtual' | null) => ['control', 'identities', 'page', { afterId, accessMode }] as const,
  backendOptionPage: (afterId: string | null) => ['control', 'backends', 'options', 'page', { afterId }] as const,
  backendOption: (backendId: string) => ['control', 'backends', 'options', backendId] as const,
  detail: (resource: ControlResource, identity: string) => ['control', resource, 'detail', identity] as const,
  relationship: (resource: ControlResource, identity: string) => ['control', resource, 'relationships', identity] as const,
  audit: (limit: number) => ['control', 'audit', { limit }] as const,
}

export function invalidateControl(client: QueryClient) {
  return client.invalidateQueries({ queryKey: controlKeys.all })
}