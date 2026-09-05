import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HealthSummary } from './HealthPage'
import type { Schema } from '../../api/control'

const health: Schema['AdminHealthResponse'] = { status: 'healthy', version: 'test', timestamp: '2026-09-05T00:00:00Z', cache: { mode: 'redis', available: true, redis_connected: true }, credentials: { count: 1 }, multipart: { store_type: 'hybrid', redis_available: true, persistence: 'enabled', warning: 'synthetic-sensitive-detail' }, authorization: { mode: 'off', coherence: 'strict', resolver_ready: false, database_ready: true, audit_required: false, audit_dispatcher_ready: true } }

describe('safe health presentation', () => {
  it('renders allowlisted diagnostics without raw warning payloads', () => {
    const markup = renderToStaticMarkup(<HealthSummary health={health} />)
    expect(markup).toContain('healthy')
    expect(markup).toContain('Not configured')
    expect(markup).not.toContain('synthetic-sensitive-detail')
  })
  it('distinguishes unavailable cache and invalid schema from ready database', () => {
    const database = { connected: true, schema_valid: false, pool: { max: 2, active: 1, idle: 1 } } satisfies Schema['DatabaseHealth']
    const markup = renderToStaticMarkup(<HealthSummary health={{ ...health, cache: { ...health.cache, available: false }, database }} />)
    expect(markup).toContain('Unavailable')
    expect(markup).toContain('Not ready')
    expect(renderToStaticMarkup(<HealthSummary health={{ ...health, database: { ...database, schema_valid: true } }} />)).toContain('Ready')
  })
})