export function boundedInteger(label: string, value: number, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

export function optionalCursor(value: string | null) {
  return value || undefined
}

export function auditLimit(limit: number) {
  return boundedInteger('Audit limit', limit, 1, 200)
}