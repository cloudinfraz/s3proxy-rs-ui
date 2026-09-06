import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import config from '../../../vite.config'

it('proxies role metadata without intercepting the IAM roles document route', () => {
  const pattern = Object.keys(config.server!.proxy!).find(value => value.startsWith('^/admin/ui/'))!
  const matcher = new RegExp(pattern)
  for (const path of ['/admin/ui/roles', '/admin/ui/roles?limit=100', '/admin/ui/roles/role-id/settings', '/admin/ui/role-policies?limit=100', '/admin/ui/identities']) expect(matcher.test(path)).toBe(true)
  for (const path of ['/admin/ui/iam-roles', '/admin/ui/login', '/admin/ui/roles-other']) expect(matcher.test(path)).toBe(false)
  const nginx = readFileSync(new URL('../../../nginx.conf', import.meta.url), 'utf8')
  expect(nginx).toContain(`location ~ ${pattern} {`)
  expect(nginx).toContain('proxy_pass http://s3proxy-control:8081;')
  const routes = readFileSync(new URL('../../ControlApp.tsx', import.meta.url), 'utf8')
  expect(routes).toContain('path="iam-roles" element={<RolesPage />}')
})