import { describe, expect, it } from 'vitest'
import type { Schema } from '../../api/control'
import { presentFinding } from './readiness'

const finding = {
  key: '0123456789abcdef0123456789abcdef',
  code: 'mapping_owner_disabled',
  severity: 'warning',
  resource_kind: 'virtual_bucket',
  resource_id: '11111111-1111-4111-8111-111111111111',
  display_name: 'reports',
  affected_count: null,
} satisfies Schema['ConfigurationFinding']

describe('configuration diagnostics presentation', () => {
  it('maps backend codes to local copy and existing resource routes', () => {
    expect(presentFinding(finding)).toEqual({
      message: 'Bucket mapping reports belongs to a disabled identity.',
      href: '/buckets',
    })
    expect(presentFinding({ ...finding, code: 'identity_no_enabled_mapping', resource_kind: 'identity', display_name: null })).toEqual({
      message: 'A virtual identity has no enabled bucket mappings.',
      href: '/credentials',
    })
    expect(presentFinding({ ...finding, code: 'role_no_attached_policy', resource_kind: 'iam_role', display_name: 'reader' }).href).toBe('/iam-roles')
    expect(presentFinding({ ...finding, code: 'admin_key_expiring', resource_kind: 'admin_api_key', display_name: 'automation' }).href).toBe('/keys')
  })

  it('presents deduplicated backend impact without exposing implementation detail', () => {
    expect(presentFinding({ ...finding, code: 'backend_unsupported_auth_mode', resource_kind: 'backend', display_name: 'archive', affected_count: 7 })).toEqual({
      message: 'Backend archive uses an authentication mode unavailable to this deployment. 7 resources are affected.',
      href: '/azure-backends',
    })
  })
})