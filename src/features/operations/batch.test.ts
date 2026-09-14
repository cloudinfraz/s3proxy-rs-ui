import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { batchOperationLimit, runBoundedBatch } from './batch'

describe('bounded batch operations', () => {
  it('executes sequentially and classifies every result without retries', async () => {
    const active: string[] = []
    const maximum: number[] = []
    const execute = vi.fn(async (key: string) => {
      active.push(key)
      maximum.push(active.length)
      await Promise.resolve()
      active.pop()
      if (key === 'failed') throw new ApiError(409, 'changed')
      if (key === 'unknown') throw new ApiError(408, 'timed out', null, 'timeout')
    })

    const result = await runBoundedBatch(['first', 'failed', 'unknown', 'last'], execute)

    expect(Math.max(...maximum)).toBe(1)
    expect(execute).toHaveBeenCalledTimes(4)
    expect(result.succeeded).toEqual(['first', 'last'])
    expect(result.failed.map(item => item.key)).toEqual(['failed'])
    expect(result.indeterminate.map(item => item.key)).toEqual(['unknown'])
  })

  it('rejects a batch above the fixed limit before executing', async () => {
    const execute = vi.fn()
    await expect(runBoundedBatch(Array.from({ length: batchOperationLimit + 1 }, (_, index) => index), execute)).rejects.toThrow('limited to 20')
    expect(execute).not.toHaveBeenCalled()
  })
})