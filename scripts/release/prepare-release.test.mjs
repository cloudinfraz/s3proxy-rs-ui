import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'prepare-release.mjs')

function fixture({ version = '1.2.3', lockVersion = version, date = '2026-09-07' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 's3proxy-ui-release-'))
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version }))
  writeFileSync(join(directory, 'package-lock.json'), JSON.stringify({
    version: lockVersion,
    packages: { '': { version: lockVersion } },
  }))
  writeFileSync(join(directory, 'CHANGELOG.md'), `# Changelog\n\n## [${version}] - ${date}\n\nRelease notes.\n`)
  return directory
}

function prepare(directory, version = '1.2.3') {
  return spawnSync(process.execPath, [script, version], { cwd: directory, encoding: 'utf8' })
}

test('extracts notes when release metadata agrees', () => {
  const directory = fixture()
  const result = prepare(directory)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(directory, 'target/release/release-notes.md'), 'utf8'), 'Release notes.\n')
})

test('rejects a lockfile version mismatch', () => {
  const result = prepare(fixture({ lockVersion: '1.2.2' }))

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /package-lock\.json versions do not match/)
})

test('rejects an invalid changelog date', () => {
  const result = prepare(fixture({ date: '2026-02-31' }))

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /invalid release date/)
})