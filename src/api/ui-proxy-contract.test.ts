import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import config from '../../vite.config'

it('proxies every admin UI API declared by the OpenAPI contract', () => {
  const pattern = Object.keys(config.server!.proxy!).find(value => value.startsWith('^/admin/ui/'))!
  const matcher = new RegExp(pattern)
  const contract: unknown = JSON.parse(readFileSync(new URL('../../contracts/admin-openapi.json', import.meta.url), 'utf8'))
  if (!contract || typeof contract !== 'object') throw new Error('Invalid OpenAPI contract')
  const paths = Reflect.get(contract, 'paths')
  if (!paths || typeof paths !== 'object') throw new Error('OpenAPI contract has no paths')

  const adminUiPaths = Object.keys(paths)
    .filter(path => path.startsWith('/admin/ui/'))
    .map(path => path.replaceAll(/\{[^/]+\}/g, 'test-id'))

  expect(adminUiPaths.length).toBeGreaterThan(0)
  for (const path of adminUiPaths) {
    expect(matcher.test(path), `${path} is missing from the UI proxy`).toBe(true)
  }

  const nginx = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8')
  expect(nginx).toContain(`location ~ ${pattern} {`)
})