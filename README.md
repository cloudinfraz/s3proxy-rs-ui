# s3proxy-rs UI

[![UI CI](https://github.com/cloudinfraz/s3proxy-rs-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/cloudinfraz/s3proxy-rs-ui/actions/workflows/ci.yml)
[![CodeQL](https://github.com/cloudinfraz/s3proxy-rs-ui/actions/workflows/codeql.yml/badge.svg)](https://github.com/cloudinfraz/s3proxy-rs-ui/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An optional web admin interface for
[s3proxy-rs](https://github.com/cloudinfraz/s3proxy-rs). The UI runs separately
from the proxy and requires its backend admin API.

Use it to manage:

- Identities, Azure backends, and virtual bucket mappings
- Bucket policies, IAM roles, and temporary credentials
- Administrator keys and audit events
- Service health and capabilities

Built with React and TypeScript. This repository contains the browser app,
an Nginx container image, and Kubernetes manifests; the backend owns the API.

## Quick start

You need Node.js **24.18.0**, npm **11.16.0**, and a separately running
[s3proxy-rs backend](https://github.com/cloudinfraz/s3proxy-rs) at
`http://127.0.0.1:8080`.

From the repository root:

```bash
npm ci --ignore-scripts --registry=https://registry.npmjs.org/
npm run generate:api
npm run dev
```

Open <http://localhost:5173/admin/ui/>. Vite forwards API requests to the
backend; it does not start the backend for you.

Dependency installation downloads third-party code. The command above uses the
committed lockfile and official npm registry with install scripts disabled.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run lint` | Lint the code |
| `npm test` | Run unit tests |
| `npm run build` | Generate API types, type-check, and build to `dist/` |
| `npm run test:deploy` | Test deployment scripts and manifests |
| `npm run test:release` | Test release scripts |
| `npm run test:e2e` | Run mocked browser tests on the built app |
| `npm run test:e2e:a11y` | Run axe checks on representative Chromium states |
| `npm run test:e2e:cross-browser` | Run bounded Firefox and WebKit smoke tests |
| `npm run test:e2e:cross-browser:container` | Run cross-browser smoke in the pinned official container |
| `make check` | Install dependencies, audit, lint, test, build, and run browser tests |
| `make aks-ui-test-job` | Schedule an in-cluster Job to validate the deployed UI |

Before browser tests, install the required Playwright engines and system dependencies:

```bash
npx playwright install --with-deps chromium firefox webkit
```

This downloads browser binaries and may require elevated privileges for system
packages. Run `npm run build` before running `npm run test:e2e` on its own.

On WSL or another host where WebKit system dependencies cannot be installed,
use `npm run test:e2e:cross-browser:container`. It runs the same smoke suite as
the current non-root user in an immutable, version-matched Microsoft Playwright
image with external container networking disabled.

The full mocked suite runs on desktop and mobile Chromium. Accessibility checks
scan representative Chromium states, while a bounded core workflow runs in
Firefox and WebKit. All use synthetic data. **Live tests are
destructive and require a disposable local backend.** Never run them against
production, staging, shared services, or retained data. See the
[browser testing guide](e2e/README.md).

### API and routing changes

The backend API contract is pinned in
[contracts/admin-openapi.json](contracts/admin-openapi.json) and
[contracts/backend-contract.json](contracts/backend-contract.json). Follow
[CONTRIBUTING.md](CONTRIBUTING.md#updating-the-backend-contract) when updating it;
do not edit generated API types by hand.

Browser routes live under `/admin/ui/`. The Azure backends page is
`/admin/ui/azure-backends`, not the API path `/admin/ui/backends`. Keep the Vite
and Nginx proxy rules aligned when changing routes, and rebuild the UI image.

## Container image

After installing dependencies, build the app and then the Docker image:

```bash
npm run build
docker build -t s3proxy-ui:local .
```

The image serves the app at `/admin/ui/` on port `8080` using unprivileged Nginx.
It contains neither the backend nor Node.js.

```text
Browser -> UI / Nginx :8080 -> s3proxy-control :8081
```

Nginx proxies admin API requests to `http://s3proxy-control:8081`, keeping browser
requests same-origin for session cookies and CSRF protection. That backend name
must resolve from the container. Both `/health` and `/healthz` check Nginx
availability, not backend health.

## Control API boundary

UI features call named operations generated from the pinned OpenAPI contract.
Successful JSON is validated before it enters feature state. Malformed or
undocumented success responses fail with a sanitized client error. React Query
cancellation reaches the underlying request, and API requests use a uniform
30-second timeout.

Run `npm run generate:api` after updating the pinned contract. A second run must
leave `src/api/schema.d.ts` and `src/api/generated/` unchanged. Backend contract
changes must be implemented, deployed, and probed in the authoritative backend
before dependent UI behavior is enabled.

Overview loads `/admin/ui/readiness` on entry, on explicit refresh, and after configuration
mutations invalidate control data. A successful result remains fresh in the client for 60 seconds;
the UI does not interval-poll it or refetch it on window focus. This operation performs complete
configuration analysis and is not a health probe. Operators and orchestration must use backend
`/health` or `/admin/health` instead.

## Deployment

The Kubernetes manifests deploy the UI in the `s3proxy` namespace alongside the
`s3proxy-control` Service on port `8081`. They do not create an Ingress; external
routing and TLS are operator-managed. UI deployment is CI/CD-only through the protected
**Publish UI image** and **Deploy UI** GitHub workflows; do not apply local source images manually.

See [docs/deployment.md](docs/deployment.md) for setup and
[docs/releasing.md](docs/releasing.md) for image publication and releases.

## Help and contributing

- [CONTRIBUTING.md](CONTRIBUTING.md): development and pull-request guidelines
- [SUPPORT.md](SUPPORT.md): questions and usage help
- [CHANGELOG.md](CHANGELOG.md): release history
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): community expectations
- [SECURITY.md](SECURITY.md): report vulnerabilities privately, not in public issues

## License

Licensed under the [MIT License](LICENSE).
