# Deployment

The UI is distributed as a standalone, unprivileged Nginx image and a set of
Kustomize manifests. Images must be deployed by immutable SHA-256 digest.

## Prerequisites

- A Kubernetes namespace named `s3proxy`
- A backend Service named `s3proxy-control` on port `8081` in that namespace
- `kubectl` with Kustomize support
- Access to a registry containing the `s3proxy-ui` image

The manifests create a two-replica Deployment and a ClusterIP Service named
`s3proxy-ui` on port `8080`. They do not create an Ingress or expose the admin
interface outside the cluster. Operators own TLS termination, authentication
boundaries, and external routing.

## Deployment policy

UI deployments are performed only by the protected **Publish UI image** and **Deploy UI** GitHub
Actions workflows. Do not build and apply a local source image to AKS, run `kubectl apply` manually,
or add a local deployment wrapper. The pipeline verifies source provenance, runs release gates,
publishes and signs the immutable image, validates the requested revision and digest, applies the
manifest, and runs the in-cluster acceptance Job.

## Render a manifest for validation

The renderer remains available for local manifest review and CI contract tests. Set a registry login
server and synthetic immutable digest, then run:

```bash
ACR_LOGIN_SERVER=example.azurecr.io \
UI_DIGEST=sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
scripts/deploy/render-ui-manifest.sh
```

The manifest is written to `target/deploy/ui.yaml` by default. Set `OUTPUT_FILE` to choose another
path. Validate the rendered content locally, but leave cluster application to the protected
**Deploy UI** workflow:

```bash
kubectl apply --dry-run=client -f target/deploy/ui.yaml
```

The renderer rejects mutable tags, malformed digests, missing inputs, and an
unresolved image placeholder.

## In-cluster deployed UI test Job

Prefer the maintained Kubernetes Job over a local port-forward when validating an already deployed
UI. The Job runs beside the UI, uses the deployed digest-pinned UI image as its test runtime, and
requires no administrator credential:

```bash
EXPECTED_KUBE_CONTEXT=aks-storage-test \
  make aks-ui-test-job
```

The script schedules `s3proxy-ui-deployed-test` in the `s3proxy` namespace with the
`s3proxy.rs/access-ui=true` label required by the optional NetworkPolicy. It verifies:

- `/health` and `/healthz`;
- CSP, no-sniff, frame, and no-store response headers;
- the JavaScript asset and configuration-findings pagination controls;
- anonymous `403` responses from readiness and Overview API routes;
- the served backend OpenAPI checksum pinned by this UI;
- S3 and metrics route isolation.

The Job uses no ServiceAccount token, Secret, bearer key, database connection, or cloud identity.
It runs as non-root with a read-only root filesystem and a `0555` ConfigMap-mounted test script.
The wrapper always removes the Job and ConfigMap, and writes non-secret evidence to
`target/deploy/ui-aks-test/evidence.json`.

By default the script reads the current `s3proxy-ui` Deployment image and rejects mutable image
references. Optional controls are `S3PROXY_NAMESPACE`, `UI_DEPLOYMENT`, `UI_IMAGE`, `OUTPUT_DIR`,
`UI_TEST_JOB_NAME`, `UI_TEST_CONFIG_NAME`, and `EXPECTED_OPENAPI_SHA256`.

This Job is an HTTP/runtime contract test, not a replacement for the browser matrix. Run
`make check` before proposing a release to execute unit, Chromium, accessibility, Firefox, and
WebKit coverage. All AKS deployment remains owned by the protected GitHub workflows, signed images,
environment approvals, and main-branch revision checks described below.

## Network policy

Set `NETWORK_POLICY_ENABLED=true` while rendering to include the optional
`allow-ui-admin` NetworkPolicy:

```bash
NETWORK_POLICY_ENABLED=true \
ACR_LOGIN_SERVER=example.azurecr.io \
UI_DIGEST=sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
scripts/deploy/render-ui-manifest.sh
```

When enabled, ingress to UI pods on port `8080` is accepted from either:

- namespaces labeled `s3proxy.rs/access-admin=true`; or
- pods in the `s3proxy` namespace labeled `s3proxy.rs/access-ui=true`.

Confirm that your ingress controller, gateway, or administrative client has the
appropriate label before enabling the policy. Rendering without the policy does
not remove a previously applied NetworkPolicy, and neither does the deployment
workflow. The default `network_policy_enabled=false` leaves existing isolation
under operator control; it does not disable isolation. Production deployments
with this option require an existing `allow-ui-admin` policy before applying
resources. For the first production deployment, provision the policy separately
or explicitly set `network_policy_enabled=true` after configuring access labels.
The cluster network plugin must enforce NetworkPolicy; operators must verify
the existing policy rules and actual allowed/denied traffic independently.

## Runtime contract

- `/health` checks that the UI Nginx process is serving requests.
- `/healthz` checks that the UI Nginx process is serving requests.
- `/admin/ui/` serves the single-page application.
- `/admin/*` is proxied to `http://s3proxy-control:8081`.

Backend and control-plane probes must use backend `/health` or authenticated `/admin/health`.
Never use `/admin/ui/readiness` as a Kubernetes, load-balancer, or startup probe: it performs
complete PostgreSQL configuration analysis and recomputes the global finding count on every page
request.

The pod runs as UID/GID `101`, drops all Linux capabilities, uses a read-only
root filesystem, disables service-account token mounting, and uses the runtime
default seccomp profile.

## GitHub release workflows

**Publish UI image** and **Deploy UI** run only from `main` in the canonical
repository and accept only the `staging` and `production` environments. Before
Azure login they verify that the requested source revision belongs to `main`.
**Deploy UI** accepts only the exact Cosign identity of **Publish UI image** at
`refs/heads/main`, not signatures from arbitrary branches or tags.

Both image publication entrypoints use `scripts/release/validate-ui.sh` for
dependency audit, pinned API contract validation, lint, unit/deployment/release
tests, build, and browser acceptance. ACR validation runs in a separate job with
only `contents: read`, no protected environment, and no OIDC permission. Only
after success does the protected publisher download the validated static assets,
build the image without npm execution, scan it, and sign its immutable digest.
GitHub Release also reuses its validation job's static assets instead of
rebuilding them in the privileged publishing job.

Each protected `staging` or `production` GitHub environment requires:

| Type | Name | Purpose |
| --- | --- | --- |
| Secret | `AZURE_CLIENT_ID` | Federated Azure identity client ID |
| Secret | `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
| Variable | `S3PROXY_AZURE_SUBSCRIPTION_ID` | Target Azure subscription |
| Variable | `S3PROXY_ACR_NAME` | Azure Container Registry name |
| Variable | `S3PROXY_AKS_NAME` | AKS cluster name |
| Variable | `S3PROXY_AKS_RG` | AKS resource group |

The Azure identity must trust the environment-specific GitHub OIDC subject. For
staging, it is:

```text
repo:cloudinfraz/s3proxy-rs-ui:environment:staging
```

Configure an equivalent protected subject for production. Restrict both GitHub
environments to the protected `main` branch, require production approval, and
disable approval bypass where available. These server-side protections are
required: workflow checks alone cannot stop an actor who can modify a workflow
on another branch from removing those checks. Protect workflow and release-script
changes through review. Grant only the ACR and AKS permissions required by the
workflows; prefer separate publishing and deployment identities. These settings
are managed outside this repository and are not provisioned by the workflows.

## Rollback

Redeploy a previously verified image digest and its matching full source
revision through **Deploy UI**. Do not retag an image or bypass signature and
revision verification. Run the workflow from `main`; older revisions already
merged into `main` remain eligible, but images signed from another branch or tag
are intentionally rejected. Rebuild those revisions through the trusted release
process instead of widening the signature identity allowlist.