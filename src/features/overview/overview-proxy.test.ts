import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import config from '../../../vite.config'

it('proxies the overview summary without intercepting the overview document route', () => {
  const pattern = Object.keys(config.server!.proxy!).find(value => value.startsWith('^/admin/ui/'))!
  const matcher = new RegExp(pattern)

  expect(matcher.test('/admin/ui/overview')).toBe(true)
  expect(matcher.test('/admin/ui/overview?refresh=true')).toBe(true)
  expect(matcher.test('/admin/ui/')).toBe(false)

  const nginx = readFileSync(new URL('../../../nginx.conf', import.meta.url), 'utf8')
  expect(nginx).toContain(`location ~ ${pattern} {`)
})