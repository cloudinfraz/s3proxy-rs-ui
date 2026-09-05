# UI Browser Tests

This suite belongs to the UI. It does not import, start, or modify the backend
E2E harness, inventory, or runner. The backend is an HTTP dependency.

## Mocked Contract Suite

From the UI root, run `npm run build` then `npm run test:e2e`.
Five scenarios run on desktop and mobile, including malformed-envelope rejection
and recovery. Mocked passes do not establish live backend compatibility.

## Live Local Suite

Start a separately managed, disposable PostgreSQL/Redis instance and a built
s3proxy at `http://127.0.0.1:8080`. Its database must be fresh enough to permit
admin bootstrap. Never point this suite at a retained or production database.

From the UI root:

```bash
npm run build
UI_E2E_DISPOSABLE=1 npm run test:e2e:live
```

The live configuration starts only Vite preview at `http://127.0.0.1:4174`.
Vite forwards admin API requests to the local proxy with `changeOrigin: false`
to preserve the browser-facing Host for backend same-origin checks. The router
uses Vite's base path, including its trailing slash, so overview reloads work.
One serial worker runs
desktop/mobile login, authenticated collection/health/capability/preflight reads,
validation/CSRF rejections, logout, and revoked-session navigation. There are no
retries. Bootstrap material remains in test-process memory; afterAll deletes the
run-owned admin key. The operator owns proxy and disposable-service teardown.

Tracing, screenshots, videos, saved authentication state, and automatic page
snapshots are disabled. The pinned Playwright runtime requires
`PLAYWRIGHT_NO_COPY_PROMPT=1` in addition to recording settings to suppress
automatic error-context page snapshots; the live config sets it. Failure messages
contain only fixed stage names, numeric HTTP statuses, and cookie-presence flags.
Do not inspect or publish raw browser artifacts
from a credential-bearing run.

The initial live attempt failed and generated potential credential-bearing
error-context snapshots. They were deleted without inspection; the proxy and
disposable services were removed. After operator authorization, a fresh database
and newly bootstrapped in-memory key were used with the snapshot guard enabled.
On 2026-09-05, both live executions passed with zero retries, including successful
login/cookie creation, overview reload, and revoked-session rejection. Key cleanup
succeeded; the proxy, disposable services, and browser artifacts were removed.
The UI gate also passed six unit tests and ten mocked browser executions.