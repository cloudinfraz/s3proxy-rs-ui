import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import config from '../../../vite.config'

it('proxies mapping metadata and backend reviews without intercepting the bucket routing page', () => {
  const pattern = Object.keys(config.server!.proxy!).find(value => value.startsWith('^/admin/ui/'))!
  const matcher = new RegExp(pattern)
  for (const path of ['/admin/ui/virtual-buckets', '/admin/ui/virtual-buckets?limit=100&after_id=cursor', '/admin/ui/virtual-buckets/mapping-id', '/admin/ui/mapping-backends/backend-id']) expect(matcher.test(path)).toBe(true)
  for (const path of ['/admin/ui/buckets', '/admin/ui/buckets?view=all', '/admin/ui/virtual-buckets-other', '/admin/ui/mapping-backends-other/backend-id']) expect(matcher.test(path)).toBe(false)
  const nginx = readFileSync(new URL('../../../nginx.conf', import.meta.url), 'utf8')
  expect(nginx).toContain(`location ~ ${pattern} {`)
  const routes = readFileSync(new URL('../../ControlApp.tsx', import.meta.url), 'utf8')
  expect(routes).toContain('path="buckets" element={<VirtualMappingsPage />}')
})