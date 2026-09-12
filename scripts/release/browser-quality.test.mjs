import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const root = new URL('../../', import.meta.url).pathname

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && !['node_modules', '.git', 'coverage', 'dist', 'test-results', 'playwright-report'].includes(entry.name)) return files(path)
    return entry.isFile() ? [relative(root, path).replaceAll('\\', '/')] : []
  })
}

test('Playwright specs live only in active e2e roots', () => {
  const outside = files(root).filter(path => path.endsWith('.spec.ts') && !path.startsWith('e2e/'))
  assert.deepEqual(outside, [])
})

test('full Chromium config excludes specialized quality suites', () => {
  const config = readFileSync(join(root, 'playwright.config.ts'), 'utf8')
  assert.match(config, /\*\*\/smoke\/\*\*/)
  assert.match(config, /\*\*\/accessibility\.spec\.ts/)
})

test('accessibility config fixes scope, tags, retries, and sensitive artifacts', () => {
  const config = readFileSync(join(root, 'playwright.accessibility.config.ts'), 'utf8')
  for (const tag of ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']) assert.match(config, new RegExp(tag))
  assert.match(config, /Desktop Chrome/)
  assert.match(config, /reducedMotion:\s*['"]reduce['"]/)
  assert.match(config, /retries:\s*0/)
  for (const artifact of ['trace', 'screenshot', 'video']) assert.match(config, new RegExp(`${artifact}:\\s*['"]off['"]`))
  assert.doesNotMatch(config, /disableRules|exclude\s*:/)
})

test('cross-browser config is bounded, retry-free, and artifact-free', () => {
  const config = readFileSync(join(root, 'playwright.cross-browser.config.ts'), 'utf8')
  assert.match(config, /testDir:\s*['"]\.\/e2e\/smoke['"]/)
  assert.match(config, /firefox-smoke/)
  assert.match(config, /Desktop Firefox/)
  assert.match(config, /webkit-smoke/)
  assert.match(config, /Desktop Safari/)
  assert.match(config, /workers:\s*1/)
  assert.match(config, /retries:\s*0/)
  assert.match(config, /timeout:\s*60_000/)
  for (const artifact of ['trace', 'screenshot', 'video']) assert.match(config, new RegExp(`${artifact}:\\s*['"]off['"]`))
})

test('CI browser quality job blocks image work and installs all required engines', () => {
  const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
  const browserQuality = workflow.split('  browser-quality:\n')[1]?.split('\n  image:')[0] ?? ''
  assert.match(browserQuality, /timeout-minutes:\s*10/)
  assert.match(browserQuality, /npx playwright install --with-deps chromium firefox webkit/)
  assert.match(browserQuality, /npm run test:e2e:a11y/)
  assert.match(browserQuality, /npm run test:e2e:cross-browser/)
  const image = workflow.split('  image:\n')[1] ?? ''
  assert.match(image, /needs:\s*\[validate, browser-quality\]/)
})

test('local cross-browser fallback uses an immutable official image without privilege escalation', () => {
  const script = readFileSync(join(root, 'scripts/release/run-cross-browser-container.sh'), 'utf8')
  const makefile = readFileSync(join(root, 'Makefile'), 'utf8')
  assert.match(script, /mcr\.microsoft\.com\/playwright@sha256:[a-f0-9]{64}/)
  assert.doesNotMatch(script, /playwright:v|sudo/)
  assert.match(script, /--user "\$\(id -u\):\$\(id -g\)"/)
  assert.match(script, /--network none/)
  assert.match(makefile, /npm run test:e2e:cross-browser:container/)
})
