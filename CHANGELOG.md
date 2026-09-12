# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added cursor-based identity pagination and paginated identity selectors for
  administration workflows.
- Added paginated backend option selectors and selected-backend lookups for
  identity and bucket mapping forms.
- Expanded unit and browser coverage for pagination, backend selection, policy
  validation, and stale asynchronous responses.

### Changed

- Switched overview resource counts to the backend summary instead of deriving
  totals from resource lists.
- Moved bucket policy scope filtering to the backend and separated query caches
  by scope so pagination follows the selected policy type.
- Updated the pinned backend contract and generated API types for pagination,
  backend options, overview summaries, and health responses.
- Updated npm dependencies and GitHub Actions, retained a compatible TypeScript
  version, and explicitly enabled strict application type checking.
- Simplified the README with a clearer quick start, command reference, container
  build instructions, and links to detailed guides.

### Fixed

- Preserved the existing identity-list response contract while adding the
  paginated identity API, and routed pagination requests through Vite and Nginx.
- Guarded bucket and managed policy dialogs against late asynchronous results
  and invalidated validation and review state when drafts change.
- Bound policy mutation confirmation to the reviewed request rather than a
  subsequently edited draft.
- Cleared stale policy simulation results when inputs change, ignored outdated
  responses, and displayed the identity, action, resource, and conditions that
  produced each result.

## [0.6.4] - 2026-09-07

### Added

- Added a Bucket routing workflow that creates server-generated virtual S3
  identities, displays credentials once, and continues directly to mapping
  creation using a credential-ID-only handoff.
- Added recovery for failed session revocation that blocks sign-in and protected
  routes until the browser verifies revocation or a retry succeeds.
- Added repository-local Spec Kit skills for specification, clarification,
  planning, task generation, implementation, analysis, and Git integration.
- Added desktop and mobile browser coverage for credential handoff, mapping
  updates, failed logout recovery, and release security boundaries.
- Added an application-level React error boundary with a reload recovery path
  for unexpected rendering failures.
- Added centralized, sanitized API error interception with request method and
  path context while preserving component-owned retry and recovery behavior.
- Added focused unit coverage for routing, API failures, shared controls, and
  administration workflows across identities, backends, bucket mappings,
  policies, IAM roles, temporary credentials, operations, and the shell.
- Added TypeScript and Vue 3 coding guidelines, including required component,
  template, and Pinia integration tests.
- Added React Testing Library, jsdom, Vue Test Utils, and matching Vue 3 compiler
  dependencies for component testing.

### Changed

- Restricted credential-to-mapping return URLs to a single allowlisted
  `credential_id` parameter and authoritative enabled virtual identities.
- Made mapping edits preserve immutable aliases and owners while submitting only
  reviewed mutable fields with current concurrency metadata.
- Isolated pending revocation state per browser tab and sanitized recovery
  failures before presenting retry actions.
- Enforced whole-source unit coverage in CI with minimum 75 percent thresholds
  for statements, branches, functions, and lines.
- Expanded CI to run coverage instead of import-only unit execution and ignore
  generated coverage artifacts.
- Updated release documentation for release-branch and manual workflow dispatch
  procedures.
- Updated endpoint example validation to reject unsafe ASCII control characters
  without relying on a control-character regular expression.

### Fixed

- Rejected malformed, whitespace-only, UUID-invalid, and non-virtual generated
  credential responses before disclosure or mapping handoff.
- Cleared one-time credential plaintext synchronously before navigation and kept
  generated access and secret keys out of query caches and request payloads.
- Improved session-expiry routing, role-dialog validation, identity-policy error
  recovery, and application error-boundary handling.
- Removed duplicate global API alerts that conflicted with contextual component
  errors and remained visible after successful retries.
- Isolated API client mocks and browser globals between tests to prevent order-
  dependent failures.
- Increased the unit-test timeout for instrumented component tests so coverage
  execution remains stable in CI.

### Security

- Added browser assertions that generated credentials do not remain in URLs,
  local storage, session storage, the DOM after acknowledgement, or outbound
  request URLs and bodies.
- Prevented access to protected content while session revocation is unresolved,
  including across reloads and direct navigation attempts.

### Deployment

- Removed a disabled UI NetworkPolicy before deployment verification so stale
  policy state cannot affect rollout health checks.
- Excluded repository metadata, environment files, coverage output, and Docker
  build definitions from the runtime image build context.

## [0.6.3] - 2026-09-07

This is the first documented release of the standalone s3proxy-rs administration
UI. It consolidates the browser application, runtime image, Kubernetes manifests,
and release automation previously developed alongside the backend.

### Added

#### Administration and sessions

- Standalone React administration application served from `/admin/ui/`.
- Session-based sign-in and sign-out with CSRF protection, session-expiry checks,
  and automatic authorization-state revalidation.
- Responsive desktop and mobile navigation with accessible keyboard and skip-link
  behavior.
- Overview dashboard showing resource counts, service capabilities, and
  configuration-readiness findings.

#### Identities and credentials

- S3 identity creation, editing, deletion, and secret rotation.
- One-time display of newly created and rotated access credentials.
- Dependency details and replacement-identity workflows for safer credential
  lifecycle management.
- Direct credential mapping mode with read-only routing details and client
  examples when routing metadata is available.

#### Azure backends and bucket routing

- Azure backend listing, creation, editing, detail inspection, and deletion.
- Managed Identity, account-key reference, and SAS-token reference authentication
  modes, gated by backend capabilities.
- Reviewed backend mutations using impact tokens and authoritative-state reloads
  when a review becomes stale.
- Reference checks that prevent deletion of backends still used by identities or
  virtual mappings.
- Virtual bucket mapping lifecycle with cursor pagination, backend overrides,
  endpoint prefixes, effective-target review, and stale-review recovery.
- Explicit separation between routing metadata changes and retained Azure
  containers or blobs.

#### Policies and authorization

- Managed policy creation, validation, editing, inspection, pagination, and
  deletion.
- Protection for built-in policies and impact review for attached policies.
- Identity policy attachment and detachment using stable identity and policy IDs.
- Bucket policy management for direct-global and virtual-bucket scopes.
- Policy preflight diagnostics and identity-policy simulation against persisted
  policy metadata.

#### IAM roles and temporary credentials

- IAM role creation, details, cursor pagination, enable/disable, duration changes,
  trust replacement, and deletion.
- Policy attachment and detachment for roles.
- Reviewed role mutations with expected policy revisions and impact tokens.
- Retained-session retirement in bounded batches and deletion gates for active or
  referenced roles.
- Trust policy editor for allow/deny statements, S3 credential principals, and
  supported IAM, STS, AWS, IP, and transport conditions.
- Temporary credential readiness view with STS and S3 endpoints, role duration
  limits, AWS CLI and JavaScript examples, and revocation guidance.

#### Operations

- Administrator API-key lifecycle with optional expiry, one-time key display,
  enable/disable controls, deletion confirmation, and last-used status.
- Audit event viewer with configurable windows, refresh, bounded pagination, and
  actor, entity, action, and timestamp details.
- Health view with runtime version, cache mode, database and schema readiness,
  authorization mode, policy resolver state, multipart persistence, and periodic
  refresh.

#### Testing and contributor experience

- Unit, API-contract, deployment-script, mocked browser, live browser, and
  deployed browser acceptance suites.
- Desktop and mobile browser coverage for navigation, lifecycle operations,
  contract failures, stale responses, responsive behavior, and credential
  handling.
- Locked local validation through `make check`, including dependency audit,
  linting, tests, generated API validation, build, and browser acceptance.
- Public contribution, support, security, conduct, issue, pull-request, E2E, and
  deployment documentation.

### Changed

- Split the UI into its own repository and runtime image, independent of the
  s3proxy-rs control-plane and data-plane images.
- Pinned the generated TypeScript API schema to an explicit backend revision and
  OpenAPI SHA-256 checksum.
- Reserved `/admin/ui/azure-backends` for the Azure backends page while retaining
  `/admin/ui/backends` and related paths for JSON APIs.
- Standardized development and CI on Node.js `24.18.0`, npm `11.16.0`, and locked
  dependency installation from the public npm registry.
- Hardened API response validation and error-envelope handling across UI
  workflows.
- Added runtime and rollback-baseline verification for deployment acceptance.

### Security

- Prevented credential-bearing browser state from being persisted to local or
  session storage.
- Disabled traces, screenshots, videos, saved authentication state, and automatic
  page snapshots for live credential-bearing browser tests.
- Added browser checks for secret leakage through storage, URLs, history, and
  delayed responses after navigation, dismissal, or sign-out.
- Added same-origin session and CSRF handling for proxied admin API requests.
- Hardened Nginx responses with Content Security Policy, frame denial, MIME
  sniffing prevention, referrer restrictions, and a restricted permissions policy.
- Added weekly CodeQL analysis and Dependabot updates for npm, GitHub Actions, and
  Docker dependencies.
- Added high and critical dependency and container-image vulnerability gates.

### Deployment

- Added an unprivileged Nginx runtime image with no Node.js toolchain, backend
  binary, database credentials, cache credentials, or Azure credentials.
- Added Kubernetes Deployment and Service manifests with two replicas, rolling
  updates, health probes, resource bounds, read-only root filesystem, dropped
  capabilities, disabled service-account token mounting, and runtime-default
  seccomp.
- Added optional NetworkPolicy rendering for explicitly labeled administrative
  namespaces and UI client pods.
- Added immutable SHA-256 image rendering and rejection of mutable deployment
  references.
- Added protected staging and production workflows using Azure workload identity
  federation.
- Added release-image provenance, SPDX SBOM generation, Trivy scanning, keyless
  Cosign signing, signature verification, and OCI source-revision verification.
- Added deployed runtime checks and browser acceptance before a deployment is
  considered complete.

### Compatibility and known limitations

- The UI requires a compatible s3proxy-rs admin API. This release is pinned to
  backend revision `7d16a4b49d7e5f9aea1e4dda03205d2afc4844c9`.
- The application must be served under `/admin/ui/` and expects same-origin
  access to `/admin/*`.
- The runtime image expects a Service named `s3proxy-control` on port `8081` in
  the same Kubernetes namespace.
- The supplied manifests do not create an Ingress or configure external TLS;
  operators own those boundaries.
- Mocked browser acceptance does not prove live-backend compatibility. The live
  suite requires an isolated, disposable backend and may create or revoke
  administrator material.
- Readiness reflects available control API metadata. Identity enabled state and
  effective role-policy readiness may be reported as unknown.
- Policy simulation and configuration review do not perform signed S3 requests,
  Azure storage I/O, or data migration.

[Unreleased]: https://github.com/cloudinfraz/s3proxy-rs-ui/compare/v0.6.4...HEAD
[0.6.4]: https://github.com/cloudinfraz/s3proxy-rs-ui/compare/v0.6.3...v0.6.4
[0.6.3]: https://github.com/cloudinfraz/s3proxy-rs-ui/releases/tag/v0.6.3
