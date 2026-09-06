import { describe, expect, it } from 'vitest'
import { virtualBucketAliasError } from './validation'

describe('virtual bucket alias validation', () => {
  it.each(['abc', 'a-1', 'reports-new', 'a'.repeat(63)])('accepts an existing-schema alias: %s', alias => {
    expect(virtualBucketAliasError(alias)).toBeUndefined()
  })

  it.each([undefined, null, 123, '', 'ab', 'a'.repeat(64), 'my.bucket.name', 'a.b', '.abc', 'abc.', 'a..b', '192.168.1.1', 'Upper', 'a_b', 'a/b', '-abc', 'abc-', ' abc', 'abc ', 'abc\n', 'a\nb', 'aéz'])('rejects an invalid alias without rewriting it: %s', alias => {
    expect(virtualBucketAliasError(alias)).toContain('Periods are not allowed.')
  })
})