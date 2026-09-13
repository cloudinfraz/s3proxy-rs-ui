export function auditPage<Row>(rows: readonly Row[], page: number) {
  if (!Number.isInteger(page) || page < 0) throw new Error('Invalid audit page')
  const pages = Math.max(1, Math.ceil(rows.length / 25))
  const index = Math.min(page, pages - 1)
  return { rows: rows.slice(index * 25, (index + 1) * 25), index, pages }
}

export function completionGuard() {
  let epoch = 0
  return {
    begin: () => ++epoch,
    cancel: () => { epoch += 1 },
    current: (request: number) => request === epoch,
  }
}