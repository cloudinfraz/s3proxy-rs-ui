import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('./test-ui-aks-job.sh', import.meta.url), 'utf8')

test('in-cluster UI test Job is digest-pinned, isolated, and self-cleaning', () => {
  assert.match(source, /UI_IMAGE must be an immutable ACR reference/)
  assert.match(source, /kind: Job/)
  assert.match(source, /s3proxy\.rs\/access-ui: "true"/)
  assert.match(source, /automountServiceAccountToken: false/)
  assert.match(source, /readOnlyRootFilesystem: true/)
  assert.match(source, /configMap: \{name: \$CONFIG_NAME, defaultMode: 0555\}/)
  assert.match(source, /pagination-bundle/)
  assert.match(source, /admin-auth-boundary/)
  assert.match(source, /openapi-checksum/)
  assert.match(source, /route-isolation/)
  assert.match(source, /trap cleanup EXIT/)
  assert.match(source, /trap 'exit 130' INT TERM/)
  assert.doesNotMatch(source, /secretKeyRef|Authorization:|Bearer /)
})