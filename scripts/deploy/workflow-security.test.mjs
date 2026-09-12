import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const deploy = readFileSync(new URL('../../.github/workflows/deploy-ui.yml', import.meta.url), 'utf8')
const publisher = readFileSync(new URL('../../.github/workflows/publish-ui-image.yml', import.meta.url), 'utf8')
const release = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')

test('UI deployments do not delete existing network isolation', () => {
  assert.doesNotMatch(deploy, /kubectl[^\n]*delete\s+(?:networkpolicy|networkpolicies|netpol)\b/)
  assert.doesNotMatch(deploy, /kubectl[^\n]*apply[^\n]*--prune/)
  assert.match(deploy, /if: inputs.deployment_environment == 'production' && inputs.network_policy_enabled == false\s+run: kubectl -n s3proxy get networkpolicy allow-ui-admin/)
  assert.ok(deploy.indexOf('get networkpolicy allow-ui-admin') < deploy.indexOf('kubectl apply'))
  assert.match(deploy, /--labels='s3proxy.rs\/access-ui=true'/)
})

test('deployment trusts only the main publisher identity and checks source before Azure login', () => {
  assert.match(deploy, /github\.ref == 'refs\/heads\/main'/)
  assert.match(deploy, /identity='https:\/\/github.com\/cloudinfraz\/s3proxy-rs-ui\/\.github\/workflows\/publish-ui-image.yml@refs\/heads\/main'/)
  assert.match(deploy, /cosign verify --certificate-identity "\$identity"/)
  assert.doesNotMatch(deploy, /--certificate-identity-regexp/)
  assert.ok(deploy.indexOf('verify-release-source.mjs') < deploy.indexOf('uses: azure/login@'))
})

test('ACR validation has no cloud identity or environment and gates publication', () => {
  const validation = publisher.split('  validate:\n')[1].split('  publish:\n')[0]
  const publication = publisher.split('  publish:\n')[1].split('  deploy:\n')[0]
  assert.match(validation, /github\.ref == 'refs\/heads\/main'/)
  assert.match(validation, /verify-release-source.mjs/)
  assert.match(validation, /permissions:\s+contents: read/)
  assert.doesNotMatch(validation, /id-token:|secrets\.|^    environment:|azure\/login@/m)
  assert.doesNotMatch(publisher.split('jobs:\n')[0], /id-token:|attestations:/)
  assert.match(publication, /needs: validate/)
  assert.doesNotMatch(publication, /npm |npx /)
  assert.match(validation, /name: validated-ui-\$\{\{ github.sha \}\}/)
  assert.match(publication, /name: validated-ui-\$\{\{ github.sha \}\}/)
  assert.match(publication, /actions\/download-artifact@[a-f0-9]{40}/)
})

test('both publication entrypoints use the same release validation gate', () => {
  for (const workflow of [publisher, release]) {
    assert.match(workflow.split('  publish:\n')[0], /run: bash scripts\/release\/validate-ui.sh/)
    const publication = workflow.split('  publish:\n')[1].split('  deploy:\n')[0]
    assert.doesNotMatch(publication, /npm |npx /)
    assert.match(publication, /actions\/download-artifact@[a-f0-9]{40}/)
  }
})