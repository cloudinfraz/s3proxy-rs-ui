// Generated from contracts/admin-openapi.json. Do not edit.
import type { operations as OpenApiOperations } from '../schema'

export type OperationId = keyof OpenApiOperations
export const operationMetadata = {
  "listAdminKeys": {
    "method": "GET",
    "path": "/admin/api-keys",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createAdminKey": {
    "method": "POST",
    "path": "/admin/api-keys",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "deleteAdminKey": {
    "method": "DELETE",
    "path": "/admin/api-keys/{key_name}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "getAdminKey": {
    "method": "GET",
    "path": "/admin/api-keys/{key_name}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateAdminKey": {
    "method": "PUT",
    "path": "/admin/api-keys/{key_name}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "listAuditEvents": {
    "method": "GET",
    "path": "/admin/audit",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listBackends": {
    "method": "GET",
    "path": "/admin/backends",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createBackend": {
    "method": "POST",
    "path": "/admin/backends",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "deleteBackend": {
    "method": "DELETE",
    "path": "/admin/backends/{name}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "getBackend": {
    "method": "GET",
    "path": "/admin/backends/{name}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateBackend": {
    "method": "PUT",
    "path": "/admin/backends/{name}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "bootstrapAdminKey": {
    "method": "POST",
    "path": "/admin/bootstrap/api-key",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "deleteBucketPolicy": {
    "method": "DELETE",
    "path": "/admin/buckets/{bucket}/policy",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "getBucketPolicy": {
    "method": "GET",
    "path": "/admin/buckets/{bucket}/policy",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "setBucketPolicy": {
    "method": "PUT",
    "path": "/admin/buckets/{bucket}/policy",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "getCapabilities": {
    "method": "GET",
    "path": "/admin/capabilities",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listCredentials": {
    "method": "GET",
    "path": "/admin/credentials",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createCredential": {
    "method": "POST",
    "path": "/admin/credentials",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "deleteCredential": {
    "method": "DELETE",
    "path": "/admin/credentials/{access_key}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "getCredential": {
    "method": "GET",
    "path": "/admin/credentials/{access_key}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateCredential": {
    "method": "PUT",
    "path": "/admin/credentials/{access_key}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "attachPolicy": {
    "method": "POST",
    "path": "/admin/credentials/{access_key}/policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      },
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "detachPolicy": {
    "method": "DELETE",
    "path": "/admin/credentials/{access_key}/policies/{name}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "rotateCredentialSecret": {
    "method": "POST",
    "path": "/admin/credentials/{credential_id}/rotate-secret",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "adminHealth": {
    "method": "GET",
    "path": "/admin/health",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "controlOpenApi": {
    "method": "GET",
    "path": "/admin/openapi.json",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listPolicies": {
    "method": "GET",
    "path": "/admin/policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createPolicy": {
    "method": "POST",
    "path": "/admin/policies",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "policyPreflight": {
    "method": "GET",
    "path": "/admin/policies/preflight",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "deletePolicy": {
    "method": "DELETE",
    "path": "/admin/policies/{name}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "getPolicy": {
    "method": "GET",
    "path": "/admin/policies/{name}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updatePolicy": {
    "method": "PUT",
    "path": "/admin/policies/{name}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "simulatePolicy": {
    "method": "POST",
    "path": "/admin/policy/simulate",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listRoles": {
    "method": "GET",
    "path": "/admin/roles",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createRole": {
    "method": "POST",
    "path": "/admin/roles",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "deleteRole": {
    "method": "DELETE",
    "path": "/admin/roles/{role_id}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "getRole": {
    "method": "GET",
    "path": "/admin/roles/{role_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "setRoleEnabled": {
    "method": "PUT",
    "path": "/admin/roles/{role_id}/enabled",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "attachRolePolicy": {
    "method": "POST",
    "path": "/admin/roles/{role_id}/policies",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "detachRolePolicy": {
    "method": "DELETE",
    "path": "/admin/roles/{role_id}/policies/{policy_name}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "retireRoleSessions": {
    "method": "POST",
    "path": "/admin/roles/{role_id}/retire-sessions",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateRoleSettings": {
    "method": "PUT",
    "path": "/admin/roles/{role_id}/settings",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateRoleTrust": {
    "method": "PUT",
    "path": "/admin/roles/{role_id}/trust",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "logout": {
    "method": "DELETE",
    "path": "/admin/session",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "getSession": {
    "method": "GET",
    "path": "/admin/session",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "login": {
    "method": "POST",
    "path": "/admin/session/login",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listBackendOptions": {
    "method": "GET",
    "path": "/admin/ui/backend-options",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "getBackendOption": {
    "method": "GET",
    "path": "/admin/ui/backend-options/{backend_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listBackendProjections": {
    "method": "GET",
    "path": "/admin/ui/backends",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createBackendForUi": {
    "method": "POST",
    "path": "/admin/ui/backends",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "getBackendProjection": {
    "method": "GET",
    "path": "/admin/ui/backends/{name}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateBackendForUi": {
    "method": "PUT",
    "path": "/admin/ui/backends/{name}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listAdminBucketPolicies": {
    "method": "GET",
    "path": "/admin/ui/bucket-policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "deleteReviewedAdminDirectBucketPolicy": {
    "method": "DELETE",
    "path": "/admin/ui/bucket-policies/direct/{bucket}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "getAdminDirectBucketPolicy": {
    "method": "GET",
    "path": "/admin/ui/bucket-policies/direct/{bucket}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateReviewedAdminDirectBucketPolicy": {
    "method": "PUT",
    "path": "/admin/ui/bucket-policies/direct/{bucket}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "deleteReviewedAdminVirtualBucketPolicy": {
    "method": "DELETE",
    "path": "/admin/ui/bucket-policies/virtual/{bucket_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "getAdminVirtualBucketPolicy": {
    "method": "GET",
    "path": "/admin/ui/bucket-policies/virtual/{bucket_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateReviewedAdminVirtualBucketPolicy": {
    "method": "PUT",
    "path": "/admin/ui/bucket-policies/virtual/{bucket_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listIdentityProjections": {
    "method": "GET",
    "path": "/admin/ui/identities",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "getIdentityProjection": {
    "method": "GET",
    "path": "/admin/ui/identities/{credential_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "detachReviewedAdminIdentityPolicy": {
    "method": "DELETE",
    "path": "/admin/ui/identities/{credential_id}/policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listAdminIdentityPolicies": {
    "method": "GET",
    "path": "/admin/ui/identities/{credential_id}/policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "attachReviewedAdminIdentityPolicy": {
    "method": "POST",
    "path": "/admin/ui/identities/{credential_id}/policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listIdentityProjectionPage": {
    "method": "GET",
    "path": "/admin/ui/identity-pages",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "reviewMappingBackend": {
    "method": "GET",
    "path": "/admin/ui/mapping-backends/{id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "getAdminOverview": {
    "method": "GET",
    "path": "/admin/ui/overview",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listAdminPolicies": {
    "method": "GET",
    "path": "/admin/ui/policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createAdminPolicy": {
    "method": "POST",
    "path": "/admin/ui/policies",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "preflightAdminPolicies": {
    "method": "GET",
    "path": "/admin/ui/policies/preflight",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "simulateAdminIdentityPolicies": {
    "method": "POST",
    "path": "/admin/ui/policies/simulate",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "validateAdminPolicyDraft": {
    "method": "POST",
    "path": "/admin/ui/policies/validate",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "deleteReviewedAdminPolicy": {
    "method": "DELETE",
    "path": "/admin/ui/policies/{policy_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "getAdminPolicy": {
    "method": "GET",
    "path": "/admin/ui/policies/{policy_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateReviewedAdminPolicy": {
    "method": "PUT",
    "path": "/admin/ui/policies/{policy_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "getAdminReadiness": {
    "method": "GET",
    "path": "/admin/ui/readiness",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listRolePolicyOptions": {
    "method": "GET",
    "path": "/admin/ui/role-policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listAdminRoles": {
    "method": "GET",
    "path": "/admin/ui/roles",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createAdminRole": {
    "method": "POST",
    "path": "/admin/ui/roles",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "deleteReviewedRole": {
    "method": "DELETE",
    "path": "/admin/ui/roles/{role_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "getAdminRole": {
    "method": "GET",
    "path": "/admin/ui/roles/{role_id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "setReviewedRoleEnabled": {
    "method": "PUT",
    "path": "/admin/ui/roles/{role_id}/enabled",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "detachReviewedRolePolicy": {
    "method": "DELETE",
    "path": "/admin/ui/roles/{role_id}/policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "attachReviewedRolePolicy": {
    "method": "POST",
    "path": "/admin/ui/roles/{role_id}/policies",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "retireReviewedRoleSessions": {
    "method": "POST",
    "path": "/admin/ui/roles/{role_id}/retire-sessions",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateReviewedRoleSettings": {
    "method": "PUT",
    "path": "/admin/ui/roles/{role_id}/settings",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "replaceReviewedRoleTrust": {
    "method": "PUT",
    "path": "/admin/ui/roles/{role_id}/trust",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listVirtualMappings": {
    "method": "GET",
    "path": "/admin/ui/virtual-buckets",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createVirtualMapping": {
    "method": "POST",
    "path": "/admin/ui/virtual-buckets",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "deleteVirtualMapping": {
    "method": "DELETE",
    "path": "/admin/ui/virtual-buckets/{id}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "getVirtualMapping": {
    "method": "GET",
    "path": "/admin/ui/virtual-buckets/{id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "updateVirtualMapping": {
    "method": "PUT",
    "path": "/admin/ui/virtual-buckets/{id}",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "listVirtualBuckets": {
    "method": "GET",
    "path": "/admin/virtual-buckets",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "createVirtualBucket": {
    "method": "POST",
    "path": "/admin/virtual-buckets",
    "successes": [
      {
        "status": 201,
        "kind": "json"
      }
    ]
  },
  "deleteVirtualBucket": {
    "method": "DELETE",
    "path": "/admin/virtual-buckets/{bucket_id}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "updateVirtualBucket": {
    "method": "PUT",
    "path": "/admin/virtual-buckets/{bucket_id}",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "deleteVirtualBucketPolicy": {
    "method": "DELETE",
    "path": "/admin/virtual-buckets/{bucket_id}/policy",
    "successes": [
      {
        "status": 204,
        "kind": "empty"
      }
    ]
  },
  "getVirtualBucketPolicy": {
    "method": "GET",
    "path": "/admin/virtual-buckets/{bucket_id}/policy",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "setVirtualBucketPolicy": {
    "method": "PUT",
    "path": "/admin/virtual-buckets/{bucket_id}/policy",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "publicHealth": {
    "method": "GET",
    "path": "/health",
    "successes": [
      {
        "status": 200,
        "kind": "json"
      }
    ]
  },
  "liveness": {
    "method": "GET",
    "path": "/healthz",
    "successes": [
      {
        "status": 200,
        "kind": "empty"
      }
    ]
  }
} as const satisfies Record<OperationId, { readonly method: string; readonly path: string; readonly successes: readonly { readonly status: number; readonly kind: 'json' | 'empty' }[] }>
