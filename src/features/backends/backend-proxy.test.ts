import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import config from '../../../vite.config'

it('proxies backend APIs without intercepting the Azure backends document route', () => {
  const pattern = Object.keys(config.server!.proxy!).find(value => value.startsWith('^/admin/ui/'))!
  const matcher = new RegExp(pattern)
  for (const path of ['/admin/ui/backends', '/admin/ui/backends?limit=100', '/admin/ui/backends/', '/admin/ui/backends/backend-name']) expect(matcher.test(path)).toBe(true)
  for (const path of ['/admin/ui/azure-backends', '/admin/ui/azure-backends?view=all', '/admin/ui/backends-other', '/admin/ui/login']) expect(matcher.test(path)).toBe(false)
  const nginx = readFileSync(new URL('../../../nginx.conf', import.meta.url), 'utf8')
  expect(nginx).toContain(`location ~ ${pattern} {`)
  const routes = readFileSync(new URL('../../ControlApp.tsx', import.meta.url), 'utf8')
  expect(routes).toContain('path="azure-backends" element={<BackendsPage />}')
  expect(routes).not.toContain('path="backends" element={<BackendsPage />}')
})