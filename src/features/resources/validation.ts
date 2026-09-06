export function virtualBucketAliasError(value: unknown): string | undefined {
  if (typeof value === 'string' && value.match(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)?.[0] === value) return undefined
  return 'S3 bucket alias must be 3-63 lowercase letters, digits or hyphens, starting and ending with a letter or digit. Periods are not allowed.'
}