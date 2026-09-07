import { describe, expect, it } from 'vitest'
import { display } from './display'

describe('display', () => {
  it.each([null, undefined, ''])('uses a placeholder for absent value %s', value => {
    expect(display(value)).toBe('-')
  })

  it('formats booleans as operational states', () => {
    expect(display(true)).toBe('Enabled')
    expect(display(false)).toBe('Disabled')
  })

  it('serializes structured values and stringifies primitives', () => {
    expect(display({ mode: 'strict', retries: 2 })).toBe('{"mode":"strict","retries":2}')
    expect(display(['primary', 3])).toBe('["primary",3]')
    expect(display(0)).toBe('0')
  })
})