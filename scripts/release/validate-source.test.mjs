import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const makefile = readFileSync(new URL('../../Makefile', import.meta.url), 'utf8')
const release = readFileSync(new URL('./validate-ui.sh', import.meta.url), 'utf8')
const sourceGate = 'scripts/release/validate-source.sh'

const expectedCommands = [
  'npm run lint',
  'npm run test:coverage',
  'npm run test:deploy',
  'npm run test:release',
  'npm run build',
]

test('CI, Make, and release validation share one source gate', () => {
  assert.match(ci, new RegExp(sourceGate.replaceAll('/', '\\/')))
  assert.match(makefile, new RegExp(sourceGate.replaceAll('/', '\\/')))
  assert.match(release, /validate-source\.sh/)
})

test('the source gate orders release tests before build', () => {
  const source = readFileSync(new URL('./validate-source.sh', import.meta.url), 'utf8')
  let previous = -1
  for (const command of expectedCommands) {
    const index = source.indexOf(command)
    assert.ok(index > previous, `${command} must follow the preceding source gate`)
    previous = index
  }
})

function validate(failCommand = '') {
  const directory = mkdtempSync(join(tmpdir(), 'ui-source-validation-'))
  try {
    const bin = join(directory, 'bin')
    const log = join(directory, 'commands.log')
    mkdirSync(bin)
    writeFileSync(log, '')
    writeFileSync(join(bin, 'npm'), '#!/bin/bash\ncommand="npm $*"\nprintf "%s\\n" "$command" >>"$COMMAND_LOG"\n[[ "$command" != "$FAIL_COMMAND" ]]\n', { mode: 0o755 })
    const result = spawnSync('bash', [new URL('./validate-source.sh', import.meta.url).pathname], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, COMMAND_LOG: log, FAIL_COMMAND: failCommand },
    })
    return { status: result.status, commands: readFileSync(log, 'utf8').trim().split('\n') }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('every source command failure blocks later validation', () => {
  assert.deepEqual(validate().commands, expectedCommands)
  for (const [index, command] of expectedCommands.entries()) {
    const result = validate(command)
    assert.equal(result.status, 1, command)
    assert.deepEqual(result.commands, expectedCommands.slice(0, index + 1))
  }
})
