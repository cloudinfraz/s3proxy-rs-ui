import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const expectedOpenApiSha256 = (JSON.parse(readFileSync('contracts/backend-contract.json', 'utf8')) as { openapi_sha256: string }).openapi_sha256

test('UI076-04 deployed base path, assets, headers and route isolation', async ({ page, request }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))

  const response = await page.goto('/admin/ui/login')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  const headers = response?.headers() ?? {}
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['cache-control']).toContain('no-store')

  const assets = await page.locator('link[rel="stylesheet"], script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href') ?? node.getAttribute('src')).filter((value): value is string => value !== null))
  expect(assets.length).toBeGreaterThan(0)
  for (const asset of assets) {
    const assetResponse = await request.get(asset)
    expect(assetResponse.status()).toBe(200)
    if (asset.startsWith('/admin/ui/assets/')) {
      expect(assetResponse.headers()['cache-control']).toContain('immutable')
    } else {
      expect(assetResponse.headers()['cache-control']).toContain('no-store')
    }
  }

  const identityPage = await request.get('/admin/ui/identity-pages?limit=1')
  expect(identityPage.status()).toBe(403)
  expect(identityPage.headers()['content-type'] ?? '').toContain('application/xml')

  const overview = await request.get('/admin/ui/overview')
  expect(overview.status()).toBe(403)
  expect(overview.headers()['content-type'] ?? '').toContain('application/xml')

  const openApi = await request.get('/admin/openapi.json')
  expect(openApi.status()).toBe(200)
  expect(openApi.headers()['content-type'] ?? '').toContain('application/json')
  expect(createHash('sha256').update(await openApi.body()).digest('hex')).toBe(expectedOpenApiSha256)

  expect((await request.get('/bucket')).status()).toBe(404)
  expect((await request.get('/metrics')).status()).toBe(404)
  expect(errors).toEqual([])
})