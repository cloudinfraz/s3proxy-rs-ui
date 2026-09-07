# s3proxy-rs UI

[![UI CI](https://github.com/cloudinfraz/s3proxy-rs-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/cloudinfraz/s3proxy-rs-ui/actions/workflows/ci.yml)
[![CodeQL](https://github.com/cloudinfraz/s3proxy-rs-ui/actions/workflows/codeql.yml/badge.svg)](https://github.com/cloudinfraz/s3proxy-rs-ui/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The standalone administration interface for
[`cloudinfraz/s3proxy-rs`](https://github.com/cloudinfraz/s3proxy-rs). It is an
optional component and is not embedded in the proxy's control-plane or data-plane
images.

The UI provides browser-based administration for:

- service health and capability status;
- identities, Azure backends, and virtual bucket mappings;
- bucket policies, IAM roles, and temporary credentials;
- administrator keys and audit events.

The backend repository owns the authoritative admin API and runtime behavior.
This repository owns the browser application, its Nginx runtime image, and its
Kubernetes deployment manifests.

## Architecture

The application is a React single-page application served by Nginx at
`/admin/ui/`. Browser requests to `/admin/*` remain same-origin so the backend
can enforce session-cookie and CSRF protections.

```text
Browser -> s3proxy-ui:8080 (Nginx) -> s3proxy-control:8081
              |                         |
              +-- /admin/ui/* assets    +-- /admin/* API
```

The fixed upstream name means the UI and the `s3proxy-control` Kubernetes
Service must run in the same namespace.

## Prerequisites

- Node.js `24.18.0` (also recorded in `.node-version`)
- npm, using the committed `package-lock.json`
- Chromium installed by Playwright for browser tests
- Docker with Buildx for the runtime image

## Development

Install the locked dependencies from the public npm registry and start Vite:

```bash
npm ci --ignore-scripts --registry=https://registry.npmjs.org/
npm run generate:api
npm run dev
```

Vite serves the application at <http://localhost:5173/admin/ui/> and proxies
admin and health requests to a locally running backend at
`http://127.0.0.1:8080`.

### API contract

`contracts/admin-openapi.json` is pinned to the backend revision and checksum in
`contracts/backend-contract.json`. When the backend contract changes:

1. Update both contract files together.
2. Run `npm run generate:api`.
3. Commit the generated `src/api/schema.d.ts` changes.

CI verifies the checksum and rejects stale generated types.

### Routing notes

The Azure backends page is `/admin/ui/azure-backends`.
`/admin/ui/backends` belongs to the JSON API and is intentionally not a browser
route. Bucket routing is available at `/admin/ui/buckets`; its JSON APIs use
`/admin/ui/virtual-buckets` and `/admin/ui/mapping-backends/:id`.

Vite and Nginx proxy these API paths before the SPA fallback. A routing change
therefore requires a rebuilt UI image; updating only the control-plane image is
not sufficient.

## Validation

Run the complete local gate:

```bash
make check
```

The gate installs locked dependencies, audits dependencies, lints, runs unit and
deployment tests, builds the application, and runs mocked browser acceptance
tests.

Individual commands are also available:

```bash
npm run lint
npm test
npm run test:deploy
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

The default Playwright suite uses synthetic API fixtures on desktop and mobile.
The live suite requires a separately managed disposable backend. See
[`e2e/README.md`](e2e/README.md) before running it; never target a retained or
production environment.

## Container image

Build the assets and the unprivileged Nginx runtime image separately:

```bash
docker run --rm -v "$PWD:/repo" -w /repo node:24.18.0-bookworm-slim \
  /bin/sh -ec 'npm ci --ignore-scripts --registry=https://registry.npmjs.org/ && npm run lint && npm test && npm run build'

docker buildx build \
  --file Dockerfile \
  --tag s3proxy-ui:local \
  --load .
```

The runtime image:

- serves the SPA at `/admin/ui/`;
- exposes `/health` and `/healthz` on port `8080`;
- proxies `/admin/*` to `http://s3proxy-control:8081`;
- contains no s3proxy binary or Node.js toolchain;
- contains no PostgreSQL, Redis, or Azure credentials;
- runs as the unprivileged Nginx user.

CI validates the image contract, scans for high and critical vulnerabilities,
and produces an SPDX software bill of materials. Published images are signed
and referenced by immutable digest.

## Deployment

The Kustomize bases in `deploy/k8s/` deploy the UI as a separate Kubernetes
workload. Staging publication and deployment use protected GitHub environments
and Azure workload identity federation; no long-lived Azure credential is
required by the workflow.

See [`docs/deployment.md`](docs/deployment.md) for manifest rendering,
prerequisites, network policy behavior, and release workflow configuration.

## Contributing

Contributions are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup,
testing, contract-update, and pull-request expectations. Participation is
governed by the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

Questions and usage help are covered by [`SUPPORT.md`](SUPPORT.md).
Release history is recorded in [`CHANGELOG.md`](CHANGELOG.md).

For security vulnerabilities, do not open a public issue. Follow
[`SECURITY.md`](SECURITY.md) to report them privately.

## License

Licensed under the [MIT License](LICENSE).
