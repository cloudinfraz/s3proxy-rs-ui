import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyReleaseSource } from './verify-release-source.mjs'

const input = { environment: 'production', revision: 'a'.repeat(40), ref: 'refs/heads/main', repository: 'cloudinfraz/s3proxy-rs-ui' }

test('accepts staging and production only after fetching and checking main ancestry', () => {
  for (const environment of ['staging', 'production']) {
    const calls = []
    verifyReleaseSource({ ...input, environment, runCommand: (...args) => calls.push(args.slice(0, 2)) })
    assert.deepEqual(calls, [
      ['git', ['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']],
      ['git', ['merge-base', '--is-ancestor', input.revision, 'refs/remotes/origin/main']],
    ])
  }
})

test('rejects non-main refs, other repositories, unknown environments and malformed revisions before git', () => {
  for (const override of [
    { ref: 'refs/heads/feature' }, { ref: 'refs/tags/v1.0.0' }, { ref: 'refs/pull/1/merge' },
    { repository: 'fork/s3proxy-rs-ui' }, { environment: 'preview' }, { environment: '' },
    { revision: '--help' }, { revision: 'abc123' },
  ]) {
    assert.throws(() => verifyReleaseSource({ ...input, ...override, runCommand: () => assert.fail('git must not run') }))
  }
})

test('fails closed when fetch or ancestry verification fails', () => {
  for (const failureAt of [1, 2]) {
    let calls = 0
    assert.throws(() => verifyReleaseSource({ ...input, runCommand: () => {
      calls += 1
      if (calls === failureAt) throw new Error('git failed')
    } }), /git failed/)
    assert.equal(calls, failureAt)
  }
})