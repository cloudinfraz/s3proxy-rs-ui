# UI browser tests

The browser suites belong to this UI repository. They do not import, start, or
modify the backend test harness; a live backend is an external HTTP dependency.

## Mocked acceptance suite

The default suite uses synthetic API fixtures and runs against desktop and
mobile Chromium profiles:

```bash
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

The Playwright configuration starts Vite preview at `http://127.0.0.1:4173`.
Tests cover navigation, responsive interaction, API contract rejection, health
recovery, credential lifecycle behavior, stale-response rejection, and bounded
pagination. Passing mocked tests does not establish compatibility with a live
backend.

## Live local suite

The live suite is destructive and may create or revoke administrator material.
Use only a disposable local environment. Never point it at production, staging,
a shared service, or a database that must be retained.

Before running it, start separately managed disposable PostgreSQL and Redis
instances and a built s3proxy backend at `http://127.0.0.1:8080`. The database
must permit administrator bootstrap.

```bash
npm run build
UI_E2E_DISPOSABLE=1 npm run test:e2e:live
```

`UI_E2E_DISPOSABLE=1` is a required acknowledgement of the isolation contract.
The suite starts only Vite preview at `http://127.0.0.1:4174`; it does not start
or stop backend services. One worker runs with no retries. The suite deletes its
run-owned administrator key, while the operator remains responsible for backend,
database, cache, container, volume, and network cleanup.

## Sensitive artifacts

Tracing, screenshots, video, saved authentication state, and automatic page
snapshots are disabled for live tests. Failure output is intentionally limited.

Do not enable recording for a credential-bearing run. Do not inspect, upload, or
publish browser output that may contain cookies, CSRF tokens, keys, private
endpoints, or request data. If such an artifact is created, delete it without
inspection and rotate potentially exposed credentials using an
operator-controlled process.