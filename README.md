# s3proxy Administration UI

The administration UI is an optional standalone component. It is not embedded
in the single, control, or data images.

## Development

The Vite development server proxies `/admin/*` to a locally running control
API:

```bash
npm ci
npm run generate:api
npm run dev
```

The browser application is rooted at `/admin/ui/` and uses same-origin
`/admin/*` requests for session cookies and CSRF protection.

## Container Image

Build from the repository root:

```bash
docker run --rm -v "$PWD:/repo" -w /repo/ui node:24.18.0-bookworm-slim \
  /bin/sh -ec 'npm ci --registry=https://registry.npmjs.org/ && npm run lint && npm test && npm run build'

docker buildx build \
  --file ui/Dockerfile \
  --tag s3proxy-ui:local \
  --load ui
```

Asset compilation and image packaging are separate. `ui/Dockerfile` is a pure
Nginx runtime image and never installs Node/npm dependencies.

The runtime image:

- serves the SPA at `/admin/ui/`;
- exposes `/health` and `/healthz` on port `8080`;
- proxies `/admin/*` to `http://s3proxy-control:8081`;
- contains no s3proxy plane binary;
- has no PostgreSQL, Redis, or Azure credentials;
- runs as the unprivileged Nginx user.

The fixed upstream DNS name expects the UI to run in the same Kubernetes
namespace as Service `s3proxy-control`. Use the optional manifests under
[`k8s/split/ui/`](../k8s/split/ui/).
