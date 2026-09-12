import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const script = fileURLToPath(new URL('./validate-ui.sh', import.meta.url))
const expectedCommands = [
  'npm ci --ignore-scripts --registry=https://registry.npmjs.org/',
  'npm audit --audit-level=high --registry=https://registry.npmjs.org/',
  'npm run generate:api',
  'git diff --exit-code -- src/api/schema.d.ts',
  'npm run lint', 'npm test', 'npm run test:deploy', 'npm run test:release',
  'npm run build', 'npx playwright install --with-deps chromium', 'npm run test:e2e',
]

function validate({ failCommand = '', checksum = 'expected' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ui-validation-'))
  try {
    const bin = join(directory, 'bin')
    const log = join(directory, 'commands.log')
    mkdirSync(bin)
    writeFileSync(log, '')
    for (const command of ['npm', 'npx', 'git']) {
      writeFileSync(join(bin, command), `#!/bin/bash\ncommand="${command} $*"\nprintf '%s\\n' "$command" >> "$COMMAND_LOG"\n[[ "$command" != "$FAIL_COMMAND" ]]\n`, { mode: 0o755 })
    }
    writeFileSync(join(bin, 'node'), '#!/bin/bash\nprintf "expected\\n"\n', { mode: 0o755 })
    writeFileSync(join(bin, 'sha256sum'), '#!/bin/bash\nprintf "%s  contract\\n" "$TEST_CHECKSUM"\n', { mode: 0o755 })
    const result = spawnSync('bash', [script], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, COMMAND_LOG: log, FAIL_COMMAND: failCommand, TEST_CHECKSUM: checksum },
    })
    return { ...result, commands: readFileSync(log, 'utf8').trim().split('\n') }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('shared validation executes every required gate in order', () => {
  const result = validate()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.commands, expectedCommands)
})

test('every failing command blocks later release gates', () => {
  for (const [index, failCommand] of expectedCommands.entries()) {
    const result = validate({ failCommand })
    assert.equal(result.status, 1, failCommand)
    assert.deepEqual(result.commands, expectedCommands.slice(0, index + 1))
  }
})

test('a mismatched backend contract checksum stops before schema generation', () => {
  const result = validate({ checksum: 'unexpected' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Pinned OpenAPI checksum/)
  assert.deepEqual(result.commands, expectedCommands.slice(0, 2))
})