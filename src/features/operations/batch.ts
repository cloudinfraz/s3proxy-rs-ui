import { isIndeterminateMutationError } from '../../api/client'

export const batchOperationLimit = 20

export type BatchFailure<Key> = Readonly<{ key: Key; error: Error }>
export type BatchResult<Key> = Readonly<{
  succeeded: readonly Key[]
  failed: readonly BatchFailure<Key>[]
  indeterminate: readonly BatchFailure<Key>[]
}>

export async function runBoundedBatch<Key>(keys: readonly Key[], execute: (key: Key) => Promise<void>): Promise<BatchResult<Key>> {
  if (keys.length > batchOperationLimit) throw new Error(`Batch operations are limited to ${batchOperationLimit} items`)
  const succeeded: Key[] = []
  const failed: BatchFailure<Key>[] = []
  const indeterminate: BatchFailure<Key>[] = []
  for (const key of keys) {
    try {
      await execute(key)
      succeeded.push(key)
    } catch (cause) {
      const failure = { key, error: cause instanceof Error ? cause : new Error('Operation failed') }
      if (isIndeterminateMutationError(cause)) indeterminate.push(failure)
      else failed.push(failure)
    }
  }
  return { succeeded, failed, indeterminate }
}