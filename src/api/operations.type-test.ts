import { invokeOperation } from './operations'

if (false) {
  void invokeOperation('getAdminOverview', {})
  void invokeOperation('getAdminReadiness', { parameters: { query: { limit: 20 } } })
  void invokeOperation('listIdentityProjectionPage', { parameters: { query: { limit: 100, access_mode: 'direct' } } })
  void invokeOperation('getIdentityProjection', { parameters: { path: { credential_id: '11111111-1111-4111-8111-111111111111' } } })
  void invokeOperation('createCredential', { body: { s3_access_key: '', s3_secret_key: '', azure_account: 'account', use_managed_identity: true, access_mode: 'direct', versioning_enabled: false } })

  // @ts-expect-error path parameters are required
  void invokeOperation('getIdentityProjection', {})
  // @ts-expect-error this operation has no request body
  void invokeOperation('getAdminOverview', { body: {} })
  // @ts-expect-error readiness limit is contract constrained to a number
  void invokeOperation('getAdminReadiness', { parameters: { query: { limit: '20' } } })
  // @ts-expect-error access_mode is contract constrained
  void invokeOperation('listIdentityProjectionPage', { parameters: { query: { access_mode: 'invalid' } } })
  // @ts-expect-error operationId must exist in the pinned OpenAPI contract
  void invokeOperation('inventedOperation', {})
}
