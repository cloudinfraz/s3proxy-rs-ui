# Contributing to s3proxy-rs UI

Thank you for helping improve the s3proxy administration experience.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Use an issue for significant behavior or contract changes so the approach can
  be discussed before implementation.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.

## Development setup

The required Node.js version is recorded in `.node-version`.

```bash
npm ci --ignore-scripts --registry=https://registry.npmjs.org/
npm run generate:api
npm run dev
```

The development server is available at
<http://localhost:5173/admin/ui/>. API requests are proxied to a backend at
`http://127.0.0.1:8080`.

## Making changes

- Keep changes focused and preserve the existing TypeScript and React style.
- Add or update tests for changed behavior.
- Use synthetic credentials and service data in tests, logs, and screenshots.
- Do not commit generated build output, browser artifacts, credentials, or
  environment-specific configuration.
- Keep browser routes under `/admin/ui/` and account for the Nginx and Vite
  proxy rules when adding API paths.

### Updating the backend contract

The backend repository owns the admin API. If a change depends on a new API
revision:

1. Update `contracts/admin-openapi.json` from the reviewed backend revision.
2. Record that full revision and the OpenAPI SHA-256 checksum in
   `contracts/backend-contract.json`.
3. Run `npm run generate:api`.
4. Commit the generated `src/api/schema.d.ts` diff.

Do not hand-edit the generated schema.

### Using the control API

Feature modules must use named operations from `src/api/operations.ts`; they
must not construct control API URLs or call the private transport. Operation
methods, parameters, bodies, success statuses, and runtime validators are
generated from `contracts/admin-openapi.json`.

Follow Red-Green-Refactor for boundary changes. Run generator tests with
`node --test scripts/api/generate-operations.test.mjs`. Every React Query
function must forward its `signal`; caller cancellation remains distinct from
the sanitized 30-second timeout error.

## Testing

Run the complete local validation gate before opening a pull request:

```bash
make check
```

To iterate on a smaller change, use the relevant commands first:

```bash
npm run lint
npm test
npm run test:deploy
npm run build
npm run test:e2e
```

Install Chromium once with `npx playwright install --with-deps chromium` before
running browser tests. The live suite has additional isolation requirements in
[`e2e/README.md`](e2e/README.md).

## Pull requests

Pull requests should:

- explain the user-visible behavior and motivation;
- describe security, compatibility, and deployment implications;
- identify the tests run and any checks that were not run;
- include screenshots for visual changes, using synthetic data only;
- update public documentation when behavior, configuration, or workflows change.

Maintainers may ask for a change to be split when unrelated concerns make it
difficult to review safely.

Release preparation uses a dedicated `release/vX.Y.Z` branch and the process in
[`docs/releasing.md`](docs/releasing.md). Release tags are created by automation
after merge and must not be pushed from the preparation branch.

## Review and licensing

All changes require review and must pass the repository's required checks.
By submitting a contribution, you agree that it is licensed under the
[MIT License](LICENSE).