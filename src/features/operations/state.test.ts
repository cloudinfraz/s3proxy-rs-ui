import { describe, expect, it } from 'vitest'
import { auditLimit, auditPage, completionGuard } from './state'

describe('bounded audit window', () => {
  it.each([1, 50, 100, 200])('accepts valid limit %s', limit => expect(auditLimit(limit)).toBe(limit))
  it.each([0, -1, 201, 1.5, NaN, Infinity])('rejects invalid limit %s', limit => expect(() => auditLimit(limit)).toThrow('Audit limit must be an integer from 1 to 200'))
  it('clamps pages after the result window shrinks', () => {
    expect(auditPage([1, 2], 8)).toEqual({ rows: [1, 2], index: 0, pages: 1 })
    expect(auditPage([], 0)).toEqual({ rows: [], index: 0, pages: 1 })
    expect(auditPage(Array.from({ length: 26 }, (_, index) => index), 1).rows).toEqual([25])
  })
  it.each([-1, 1.5, NaN, Infinity])('rejects invalid page %s', page => expect(() => auditPage([], page)).toThrow())
})

describe('ephemeral completion ownership', () => {
  it('accepts current completion and rejects superseded requests', () => {
    const guard = completionGuard()
    const first = guard.begin()
    expect(guard.current(first)).toBe(true)
    const next = guard.begin()
    expect(guard.current(first)).toBe(false)
    expect(guard.current(next)).toBe(true)
  })
  it('rejects late completion after dismissal, route transition or logout unmount', () => {
    const guard = completionGuard()
    const request = guard.begin()
    guard.cancel()
    expect(guard.current(request)).toBe(false)
    expect(guard.current(guard.begin())).toBe(true)
  })
})