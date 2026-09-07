import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runtimeDigests, verifyPods, verifyRuntime } from './verify-ui-runtime.mjs'

const index = `sha256:${'a'.repeat(64)}`
const child = `sha256:${'b'.repeat(64)}`
const image = `registry.example/ui@${index}`
const manifest = { manifests: [{ digest: child, platform: { os: 'linux' } }] }
const row = { name: 'ui-1', ready: 'True', image, imageID: `registry.example/ui@${child}` }

test('accepts a ready platform image belonging to the immutable index', () => {
  assert.deepEqual(verifyPods({ image, manifest, rows: [row], expectedReplicas: 1 }), [child])
})

test('rejects tags, attestation digests, and readiness mismatches', () => {
  assert.throws(() => runtimeDigests('registry.example/ui:latest', manifest))
  assert.equal(runtimeDigests(image, { manifests: [{ digest: child, platform: { os: 'unknown' } }] }).has(child), false)
  assert.throws(() => verifyPods({ image, manifest, rows: [], expectedReplicas: 1 }))
  assert.throws(() => verifyPods({ image, manifest, rows: [{ ...row, image: 'other' }], expectedReplicas: 1 }))
})

test('verifies the serving platform image revision', () => {
  const revision = 'd'.repeat(40)
  const responses = [JSON.stringify(manifest), '1', `${row.name}\tTrue\t${image}\t${row.imageID}`, '', revision]
  verifyRuntime({ image, revision, runCommand: () => responses.shift() })
  assert.equal(responses.length, 0)
})

test('fails closed on invalid revision or command errors', () => {
  const revision = 'd'.repeat(40)
  assert.throws(() => verifyRuntime({ image, revision: '', runCommand: () => assert.fail() }))
  assert.throws(() => verifyRuntime({ image, revision, runCommand: () => { throw new Error('unavailable') } }))
})