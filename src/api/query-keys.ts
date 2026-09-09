import type { QueryClient } from '@tanstack/react-query'

export type ControlResource = 'identities' | 'buckets' | 'backends' | 'policies' | 'keys' | 'roles'

export const controlKeys = {
  all: ['control'] as const,
  session: ['session'] as const,
  capabilities: ['control', 'capabilities'] as const,
  overview: ['control', 'overview'] as const,
  health: ['control', 'health'] as const,
  list: (resource: ControlResource) => ['control', resource, 'list'] as const,
  identityPage: (afterId: string | null, accessMode: 'direct' | null) => ['control', 'identities', 'page', { afterId, accessMode }] as const,
  detail: (resource: ControlResource, identity: string) => ['control', resource, 'detail', identity] as const,
  relationship: (resource: ControlResource, identity: string) => ['control', resource, 'relationships', identity] as const,
  audit: (limit: number) => ['control', 'audit', { limit }] as const,
}

export function invalidateControl(client: QueryClient) {
  return client.invalidateQueries({ queryKey: controlKeys.all })
}