import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { controlKeys, invalidateControl } from './query-keys'

describe('control query ownership', () => {
  it('invalidates lists, details, relationships, overview and health without clearing session', async () => {
    const client = new QueryClient()
    const keys = [controlKeys.list('keys'), controlKeys.detail('keys', 'example'), controlKeys.relationship('roles', 'role-id'), controlKeys.overview, controlKeys.readiness, controlKeys.health, controlKeys.audit(100)]
    for (const key of [...keys, controlKeys.session]) client.setQueryData(key, {})
    await invalidateControl(client)
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    expect(client.getQueryState(controlKeys.session)?.isInvalidated).toBe(false)
  })

  it('separates audit windows and resource identities', () => {
    expect(controlKeys.audit(50)).not.toEqual(controlKeys.audit(100))
    expect(controlKeys.list('keys')).not.toEqual(controlKeys.detail('keys', 'example'))
  })
})