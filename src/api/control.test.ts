import { describe, expect, it } from 'vitest'
import { arrayRows, envelopeRows, controlQueries } from './control'

describe('typed read boundaries', () => {
  it('preserves arrays and exact envelope counts including empty results', () => {
    expect(envelopeRows({ count: 1, items: ['row'] })).toEqual(['row'])
    expect(envelopeRows({ count: 0, items: [] })).toEqual([])
    expect(arrayRows(['row'])).toEqual(['row'])
  })
  it('rejects missing items, mismatched counts and invalid arrays', () => {
    for (const response of [{ count: 0 }, { count: 1, items: [] }, null]) {
      expect(() => envelopeRows(response as { count: number; items: string[] })).toThrow('Invalid resource collection response')
    }
    expect(() => arrayRows({} as string[])).toThrow()
    expect(() => controlQueries.audit(201)).toThrow()
  })
})