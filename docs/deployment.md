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

## Render a manifest

Set the registry login server and immutable image digest, then run:

```bash
ACR_LOGIN_SERVER=example.azurecr.io \
UI_DIGEST=sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
scripts/deploy/render-ui-manifest.sh
```

The manifest is written to `target/deploy/ui.yaml` by default. Set
`OUTPUT_FILE` to choose another path. Review it before applying:

```bash
kubectl apply -f target/deploy/ui.yaml
kubectl -n s3proxy rollout status deployment/s3proxy-ui --timeout=5m
```

The renderer rejects mutable tags, malformed digests, missing inputs, and an
unresolved image placeholder.

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
not remove a previously applied NetworkPolicy; the deployment workflow handles
that cleanup when its option is disabled.

## Runtime contract

- `/health` checks the proxied backend health endpoint.
- `/healthz` checks that the UI Nginx process is serving requests.
- `/admin/ui/` serves the single-page application.
- `/admin/*` is proxied to `http://s3proxy-control:8081`.

The pod runs as UID/GID `101`, drops all Linux capabilities, uses a read-only
root filesystem, disables service-account token mounting, and uses the runtime
default seccomp profile.

## GitHub release workflows

**Publish UI image** builds, validates, scans, signs, and publishes an immutable
image. It can optionally invoke **Deploy UI**, which verifies the signature and
embedded source revision before applying the manifest and running deployed
browser acceptance tests.

Each protected `staging` or `production` GitHub environment requires:

| Type | Name | Purpose |
| --- | --- | --- |
| Secret | `AZURE_CLIENT_ID` | Federated Azure identity client ID |
| Secret | `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
| Variable | `S3PROXY_AZURE_SUBSCRIPTION_ID` | Target Azure subscription |
| Variable | `S3PROXY_ACR_NAME` | Azure Container Registry name |
| Variable | `S3PROXY_AKS_NAME` | AKS cluster name |
| Variable | `S3PROXY_AKS_RG` | AKS resource group |
| Variable | `S3PROXY_CURL_IMAGE` | Digest-pinned image used for health checks |

The Azure identity must trust the environment-specific GitHub OIDC subject. For
staging, it is:

```text
repo:cloudinfraz/s3proxy-rs-ui:environment:staging
```

Configure an equivalent protected subject for production. Grant only the ACR
and AKS permissions required by the workflows.

## Rollback

Redeploy a previously verified image digest and its matching full source
revision through **Deploy UI**. Do not retag an image or bypass signature and
revision verification.