#!/usr/bin/env bash
set -euo pipefail

npm ci --ignore-scripts --registry=https://registry.npmjs.org/
npm audit --audit-level=high --registry=https://registry.npmjs.org/
expected="$(node -e "console.log(require('./contracts/backend-contract.json').openapi_sha256)")"
actual="$(sha256sum contracts/admin-openapi.json | awk '{print $1}')"
[[ "$actual" == "$expected" ]] || {
  echo "Pinned OpenAPI checksum does not match backend-contract.json" >&2
  exit 1
}
npm run generate:api
git diff --exit-code -- src/api/schema.d.ts
npm run lint
npm test
npm run test:deploy
npm run test:release
npm run build
npx playwright install --with-deps chromium
npm run test:e2e