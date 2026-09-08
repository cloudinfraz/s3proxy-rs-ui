# Credential-to-mapping workflow

## Purpose

Operators must be able to create server-generated S3 credentials and continue
directly to virtual bucket routing without exposing secret material beyond the
one-time credential dialog.

## Requirements

### UI077-01 Server-generated virtual identity

- Bucket routing provides a direct action to create a virtual S3 identity.
- The identity request leaves `s3_access_key` and `s3_secret_key` empty so the
  control API generates both values.
- The workflow fixes the access mode to `virtual`; a direct identity cannot own
  a virtual bucket mapping.
- The response must contain a credential UUID, access key, and secret key before
  the workflow can continue.

### UI077-02 One-time secret handling

- The access key and secret are displayed only in a blocking one-time dialog.
- The operator must explicitly acknowledge secure storage before continuing.
- Secret material is never placed in a URL, browser storage, query cache, log,
  error message, or bucket-mapping payload.
- Acknowledgement clears the plaintext secret before navigation.

### UI077-03 Mapping handoff

- After acknowledgement, the UI returns to Bucket routing, refreshes control
  data, opens the create-mapping form, and preselects the created identity.
- Cross-page workflow parameters are allowlisted. Only the non-secret credential
  UUID may be carried to Bucket routing.
- If the identity is unavailable or is not virtual, the mapping form remains
  usable and reports that another virtual identity must be selected.
- A mapping failure does not recreate or remove the successfully created
  identity.

### UI077-04 Mapping update boundaries

- Mapping updates may change the Azure container, backend override, endpoint
  prefix, and enabled state.
- Mapping ID, S3 bucket alias, and owning credential remain immutable.
- The edit form explains that changing ownership requires a new mapping.
- Existing impact-token and backend-revision concurrency checks remain intact.

## Acceptance scenarios

1. From Bucket routing, create a virtual identity, receive generated credentials,
   acknowledge them, and create a mapping with the returned credential UUID.
2. Verify the secret disappears before navigation and never occurs in the URL,
   local storage, session storage, or mapping request.
3. Follow a missing or non-virtual credential handoff and verify that the mapping
   form opens with a recoverable validation message.
4. Edit a mapping and verify only mutable routing fields are submitted while the
   alias and identity controls remain disabled.

## API assumptions

- `POST /admin/credentials` generates access and secret keys when their request
  values are empty and returns them once with no-store response semantics.
- `POST /admin/ui/virtual-buckets` accepts a stable `credential_id` owned by a
  virtual identity.
- `PUT /admin/ui/virtual-buckets/{id}` does not support alias or owner changes.