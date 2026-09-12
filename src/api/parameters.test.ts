import { describe, expect, it } from 'vitest'
import { boundedInteger, optionalCursor } from './parameters'

describe('API parameters', () => {
  it('accepts bounded integers and rejects invalid values before dispatch', () => {
    expect(boundedInteger('Audit limit', 1, 1, 200)).toBe(1)
    expect(boundedInteger('Audit limit', 200, 1, 200)).toBe(200)
    for (const value of [0, 201, 1.5, Number.NaN]) expect(() => boundedInteger('Audit limit', value, 1, 200)).toThrow('Audit limit')
  })

  it('omits empty cursors and preserves non-empty cursor values', () => {
    expect(optionalCursor(null)).toBeUndefined()
    expect(optionalCursor('')).toBeUndefined()
    expect(optionalCursor('next/id')).toBe('next/id')
  })
})