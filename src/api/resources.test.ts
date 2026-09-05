import { describe, expect, it } from 'vitest'
import { normalizeResourceRows } from './resources'

describe('normalizeResourceRows', () => {
  it('normalizes credential and policy envelopes', () => {
    expect(normalizeResourceRows('/admin/credentials', {
      count: 1,
      items: [{ s3_access_key: 'AKIA_TEST', azure_account: 'storage' }],
    })).toEqual([{ s3_access_key: 'AKIA_TEST', azure_account: 'storage' }])

    expect(normalizeResourceRows('/admin/policies', {
      count: 1,
      items: [{ name: 'read-only' }],
    })).toEqual([{ name: 'read-only' }])
  })

  it('preserves array collection rows', () => {
    expect(normalizeResourceRows('/admin/backends', [
      { name: 'primary', auth_mode: 'managed_identity' },
    ])).toEqual([{ name: 'primary', auth_mode: 'managed_identity' }])
  })

  it('treats an omitted envelope items field as empty', () => {
    expect(normalizeResourceRows('/admin/credentials', { count: 0 })).toEqual([])
  })
})