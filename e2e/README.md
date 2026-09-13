# UI browser tests

The browser suites belong to this UI repository. They do not import, start, or
modify the backend test harness; a live backend is an external HTTP dependency.

## Layout

```text
e2e/
├── config/         Playwright configs for every suite
├── mocked/         desktop/mobile Chromium acceptance tests and fixtures
├── accessibility/  axe accessibility scenarios
├── smoke/          bounded Firefox/WebKit workflow
├── live/           credential-bearing live backend scenarios
└── deployed/       non-mutating deployed release checks
```

Use the npm scripts below rather than relying on Playwright's implicit config
discovery. This keeps each suite's test root, browser matrix, server, and
artifact policy explicit.

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

## Browser quality suites

The accessibility suite scans login, authenticated navigation, a data table,
and critical dialog states with fixed WCAG A/AA axe tags:

```bash
npm run test:e2e:a11y
```

The cross-browser suite runs one core desktop workflow in Firefox and WebKit
with one worker and no retries:

```bash
npm run test:e2e:cross-browser
```

For WSL or hosts without compatible WebKit libraries, use the version-matched
official container fallback instead of changing system packages:

```bash
npm run test:e2e:cross-browser:container
```

These suites use synthetic data and mocked same-origin APIs. Trace, screenshot,
video, and persisted authentication state remain disabled. Keep the full
regression matrix in desktop/mobile Chromium; add Firefox/WebKit cases only when
they extend the bounded core smoke contract.

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

The default live gate covers real browser login/session behavior, authenticated
control reads, logout revocation, and the administrator-key lifecycle. The
long-running identity/mapping/policy/S3 authorization scenario is intentionally
excluded from the UI-owned release gate. It requires a backend-owned E2E
orchestrator to provision deterministic fixtures, expose stable resource IDs,
perform signed S3 assertions, and own cleanup. Real Azure object round trips
remain backend Tier C coverage.

For an approved dev AKS cluster, build `Dockerfile.live`, publish it under an
immutable ACR digest, and use `scripts/deploy/test-ui-aks-live-job.sh`. This is a
separate credential-bearing path and is never part of `make check` or the
anonymous deployed Job. It provisions a random temporary administrator key
through the deployed migrator, passes it through a run-owned Secret, and revokes
it only after the Playwright Job finishes. It requires an exact cluster UID,
explicit in-cluster UI/control Service URLs, and the approval phrase
documented in the deployment guide. Do not execute that Job without the
environment owner's authorization for the specific run.

## Sensitive artifacts

Tracing, screenshots, video, saved authentication state, and automatic page
snapshots are disabled for live tests. Failure output is intentionally limited.

Do not enable recording for a credential-bearing run. Do not inspect, upload, or
publish browser output that may contain cookies, CSRF tokens, keys, private
endpoints, or request data. If such an artifact is created, delete it without
inspection and rotate potentially exposed credentials using an
operator-controlled process.