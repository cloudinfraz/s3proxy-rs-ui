# UI Browser Tests

This suite belongs to the UI. It does not import, start, or modify the backend
E2E harness, inventory, or runner. The backend is an HTTP dependency.

## Mocked Contract Suite

From the UI root, run `npm run build` then `npm run test:e2e`.
Twelve unique scenario IDs cover 14 test cases on desktop and mobile (28 executions), including
malformed-envelope rejection, navigation/history, keyboard/mobile navigation,
health refresh recovery, admin-key lifecycle, late-response rejection, and bounded
audit pagination. Mocked passes do not establish live backend compatibility.

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

## Shell and Operations Evidence (#424)

On 2026-09-05, `make ui-check` passed the locked dependency audit (zero
vulnerabilities), lint, 36 unit tests, build, and all 28 mocked browser executions.
UI069-01 through UI069-07 are seven unique scenario IDs (nine cases, 18 viewport executions);
the five existing contract/security scenarios remain covered (10 executions).
UI069-06 covers late responses after navigation, dismissal, and logout. Each
transition rejects the delayed secret on desktop and mobile without browser storage.
Synthetic desktop/mobile health screenshots were reviewed for layout and overflow.

`UI_E2E_DISPOSABLE=1 npm run test:e2e:live` passed both serial viewport executions
with zero retries against a fresh local proxy and disposable PostgreSQL/Redis.
The existing live journey now visits Audit, Health, Admin keys, and Overview in
addition to its real authentication, contract, validation, and logout assertions.
This is read-oriented live evidence; admin-key mutation lifecycle coverage is
mocked, not a claim of live mutation coverage.

`make ci-local-e2e` passed, including 947 application tests (five ignored) and
81/81 strict Tier A tests with zero skips and exact inventory reconciliation.
Backend source, E2E inventory, fixtures, harness, and runners were not changed.
No Azure/cloud lane was needed or run for this UI-only change.

Bootstrap cleanup passed. The local proxy and disposable services were removed;
browser artifacts were deleted without inspection after the live run. Container,
volume, and port checks confirmed cleanup.

Readiness is configuration-only, not an Azure connectivity probe. The current
API does not expose identity enabled state or effective role policies; these are
reported as unknown rather than inferred. No unsupported entity links are added.