# s3proxy-rs UI

The administration UI is an optional standalone component. It is not embedded
in the single, control, or data images. The backend and authoritative admin API
contract live in [`cloudinfraz/s3proxy-rs`](https://github.com/cloudinfraz/s3proxy-rs).

## Development

The Vite development server proxies `/admin/*` to a locally running control
API:

```bash
npm ci
npm run generate:api
npm run dev
```

`contracts/admin-openapi.json` is pinned to the backend revision recorded in
`contracts/backend-contract.json`. Update both files together, regenerate
`src/api/schema.d.ts`, and include the generated diff in review.

The browser application is rooted at `/admin/ui/` and uses same-origin
`/admin/*` requests for session cookies and CSRF protection.

The Azure backends page is `/admin/ui/azure-backends`. Update old browser
bookmarks: `/admin/ui/backends` is reserved for the JSON API, including its
child routes. Vite and Nginx proxy those API requests before the SPA fallback.
Deploy a rebuilt UI image to apply both the page and Nginx routing changes;
changing only the control-plane image does not update this standalone UI.

Bucket routing remains at `/admin/ui/buckets`. Its JSON APIs are
`/admin/ui/virtual-buckets` (including child routes) and
`/admin/ui/mapping-backends/:id`; both are proxied before the SPA fallback.

## Container Image

Build from the repository root:

```bash
docker run --rm -v "$PWD:/repo" -w /repo node:24.18.0-bookworm-slim \
  /bin/sh -ec 'npm ci --registry=https://registry.npmjs.org/ && npm run lint && npm test && npm run build'

docker buildx build \
  --file Dockerfile \
  --tag s3proxy-ui:local \
  --load .
```

Asset compilation and image packaging are separate. `Dockerfile` is a pure
Nginx runtime image and never installs Node/npm dependencies.

The runtime image:

- serves the SPA at `/admin/ui/`;
- exposes `/health` and `/healthz` on port `8080`;
- proxies `/admin/*` to `http://s3proxy-control:8081`;
- contains no s3proxy plane binary;
- has no PostgreSQL, Redis, or Azure credentials;
- runs as the unprivileged Nginx user.

The fixed upstream DNS name expects the UI to run in the same Kubernetes
namespace as Service `s3proxy-control`.

### Staging Publication and Deployment

Run **Publish UI image** with the `staging` environment. The workflow builds,
scans, signs, and publishes an immutable image, then deploys it to AKS by
default. **Deploy UI** can also deploy an existing digest independently.

The protected `staging` environment requires `AZURE_CLIENT_ID` and
`AZURE_TENANT_ID` secrets plus these variables:

- `S3PROXY_ACR_NAME`
- `S3PROXY_AKS_NAME`
- `S3PROXY_AKS_RG`
- `S3PROXY_AZURE_SUBSCRIPTION_ID`
- `S3PROXY_CURL_IMAGE` (digest-pinned)

The Azure identity must trust the GitHub OIDC subject
`repo:cloudinfraz/s3proxy-rs-ui:environment:staging`. Production requires an
equivalent environment-specific federated credential and protected configuration.

## Tests

```bash
npm run lint
npm test
npm run test:deploy
npm run build
npm run test:e2e
```

The default Playwright lane uses synthetic mocked API fixtures and runs desktop
and mobile projects. `npm run test:e2e:live` targets a disposable local backend;
see `e2e/README.md` for its prerequisites and cleanup contract. Deployed browser
acceptance uses `playwright.deployed.config.ts` and an explicit
`DEPLOYED_UI_BASE_URL` supplied by the guarded deployment workflow.

Rust API-level Tier A and Tier C tests remain in the backend repository. They
validate the admin API and do not move with browser code.
