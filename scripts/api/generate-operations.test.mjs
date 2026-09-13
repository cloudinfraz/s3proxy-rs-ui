import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { collectOperations, generateArtifacts, writeArtifacts } from './generate-operations.mjs'

const contractUrl = new URL('../../contracts/admin-openapi.json', import.meta.url)
const contract = JSON.parse(await readFile(contractUrl, 'utf8'))
const consumedOperationIds = [
  'login', 'getSession', 'logout', 'createAdminKey', 'createCredential', 'rotateCredentialSecret',
  'getAdminOverview', 'listCredentials', 'listPolicies', 'listVirtualBuckets', 'listBackends', 'listBackendProjections',
  'listAdminKeys', 'listIdentityProjectionPage', 'getIdentityProjection', 'listBackendOptions',
  'getBackendOption', 'listVirtualMappings', 'getVirtualMapping', 'reviewMappingBackend',
  'getBackendProjection', 'getCapabilities', 'adminHealth', 'listAuditEvents', 'listAdminPolicies',
  'getAdminPolicy', 'listAdminBucketPolicies', 'getAdminDirectBucketPolicy',
  'getAdminVirtualBucketPolicy', 'listAdminIdentityPolicies', 'preflightAdminPolicies',
  'listRolePolicyOptions', 'listAdminRoles', 'getAdminRole', 'deleteBackend', 'updateCredential',
  'deleteCredential', 'createPolicy', 'deletePolicy', 'createVirtualBucket', 'deleteVirtualBucket',
  'updateAdminKey', 'deleteAdminKey', 'createBackendForUi', 'updateBackendForUi',
  'createVirtualMapping', 'updateVirtualMapping', 'deleteVirtualMapping', 'createAdminRole',
  'replaceReviewedRoleTrust', 'updateReviewedRoleSettings', 'setReviewedRoleEnabled',
  'retireReviewedRoleSessions', 'attachReviewedRolePolicy', 'detachReviewedRolePolicy',
  'deleteReviewedRole', 'validateAdminPolicyDraft', 'simulateAdminIdentityPolicies',
  'createAdminPolicy', 'updateReviewedAdminPolicy', 'deleteReviewedAdminPolicy',
  'attachReviewedAdminIdentityPolicy', 'detachReviewedAdminIdentityPolicy',
  'updateReviewedAdminDirectBucketPolicy', 'deleteReviewedAdminDirectBucketPolicy',
  'updateReviewedAdminVirtualBucketPolicy', 'deleteReviewedAdminVirtualBucketPolicy',
]

test('collects unique OpenAPI operations with exact method, path, and success metadata', () => {
  const operations = collectOperations(contract)
  assert.equal(operations.length, 100)
  assert.equal(new Set(operations.map(operation => operation.operationId)).size, operations.length)
  assert.equal(consumedOperationIds.length, 67)
  const identifiers = new Set(operations.map(operation => operation.operationId))
  assert.deepEqual(consumedOperationIds.filter(operationId => !identifiers.has(operationId)), [])

  assert.deepEqual(
    operations.find(operation => operation.operationId === 'getAdminOverview'),
    {
      operationId: 'getAdminOverview',
      method: 'GET',
      path: '/admin/ui/overview',
      successes: [{ status: 200, kind: 'json', schema: { $ref: '#/components/schemas/AdminOverviewSummary' } }],
    },
  )
  assert.deepEqual(
    operations.find(operation => operation.operationId === 'logout'),
    {
      operationId: 'logout',
      method: 'DELETE',
      path: '/admin/session',
      successes: [{ status: 204, kind: 'empty' }],
    },
  )
})

test('generates standalone validators for OpenAPI 3.1 response constraints', async () => {
  const { validators } = generateArtifacts(contract)
  assert.match(validators, /validate_getIdentityProjection_200/)
  assert.doesNotMatch(validators, /from ['"]ajv(?:\/|['"])/)

  const directory = await mkdtemp(join(process.cwd(), '.tmp-s3proxy-validators-'))
  try {
    const moduleUrl = new URL(`file://${join(directory, 'validators.mjs')}`)
    await writeFile(moduleUrl, validators)
    const generated = await import(moduleUrl.href)
    const validateIdentity = generated.responseValidators.getIdentityProjection[200]
    const identity = {
      credential_id: '11111111-1111-4111-8111-111111111111',
      s3_access_key: 'synthetic-access',
      azure_account: 'account',
      access_mode: 'direct',
      use_managed_identity: true,
      versioning_enabled: false,
      default_backend_id: null,
      enabled: true,
      virtual_bucket_count: 0,
      policy_attachment_count: 0,
    }
    assert.equal(validateIdentity(identity), true)
    assert.equal(validateIdentity({ ...identity, credential_id: 'not-a-uuid' }), false)
    assert.equal(validateIdentity({ ...identity, access_mode: 'invalid' }), false)
    assert.equal(validateIdentity({ ...identity, extra: 'forbidden' }), false)

    const validateHealth = generated.responseValidators.adminHealth[200]
    assert.equal(validateHealth({ status: 'healthy' }), false)
    assert.equal(validateIdentity.errors === null || Array.isArray(validateIdentity.errors), true)
    assert.doesNotMatch(JSON.stringify(validateIdentity.errors), /synthetic-access/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('emits deterministic typed operation and validator artifacts', async () => {
  const first = generateArtifacts(contract)
  const second = generateArtifacts(contract)
  assert.equal(first.operationSource, second.operationSource)
  assert.equal(first.validators, second.validators)
  assert.equal(first.validatorDeclaration, second.validatorDeclaration)
  assert.match(first.operationSource, /satisfies Record<OperationId/)

  const directory = await mkdtemp(join(process.cwd(), '.tmp-s3proxy-generation-'))
  try {
    const operationsPath = join(directory, 'operations.ts')
    const validatorsPath = join(directory, 'validators.js')
    await writeArtifacts(contract, operationsPath, validatorsPath)
    assert.equal(await readFile(operationsPath, 'utf8'), first.operationSource)
    assert.equal(await readFile(validatorsPath, 'utf8'), first.validators)
    assert.equal(await readFile(join(directory, 'validators.d.ts'), 'utf8'), first.validatorDeclaration)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
