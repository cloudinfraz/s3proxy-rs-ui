import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import config, { policyDocumentBypass } from '../../../vite.config'

it('proxies only policy control APIs and registers the dedicated operator workspace', () => {
  const pattern = Object.keys(config.server!.proxy!).find(value => value.startsWith('^/admin/ui/'))!
  const matcher = new RegExp(pattern)
  for (const path of [
    '/admin/ui/policies?limit=100',
    '/admin/ui/policies/policy-id',
    '/admin/ui/policies/validate',
    '/admin/ui/policies/preflight?limit=100',
    '/admin/ui/policies/simulate',
    '/admin/ui/identities/credential-id/policies?limit=100',
    '/admin/ui/bucket-policies?limit=100',
    '/admin/ui/bucket-policies/direct/reports',
    '/admin/ui/bucket-policies/virtual/bucket-id',
  ]) expect(matcher.test(path)).toBe(true)
  for (const path of ['/admin/ui/policy', '/admin/ui/policies-other', '/admin/ui/bucket-policies-other', '/admin/ui/login']) expect(matcher.test(path)).toBe(false)

  const nginx = readFileSync(new URL('../../../nginx.conf', import.meta.url), 'utf8')
  expect(nginx).toContain(`location ~ ${pattern} {`)
  expect(nginx).toContain('proxy_pass http://s3proxy-control:8081;')
  expect(nginx).toContain('location = /admin/ui/policies {')
  expect(nginx).toContain('error_page 418 = @policy_ui_document;')
  expect(policyDocumentBypass({ method: 'GET', url: '/admin/ui/policies', headers: { accept: 'text/html,application/xhtml+xml' } })).toBe('/index.html')
  expect(policyDocumentBypass({ method: 'GET', url: '/admin/ui/policies?limit=100', headers: { accept: '*/*' } })).toBeUndefined()
  expect(policyDocumentBypass({ method: 'POST', url: '/admin/ui/policies', headers: { accept: '*/*' } })).toBeUndefined()
  const routes = readFileSync(new URL('../../ControlApp.tsx', import.meta.url), 'utf8')
  expect(routes).toContain('path="policies" element={<PolicyWorkspace />}')
  expect(routes).not.toContain('path="policies" element={<ResourcePage')
})