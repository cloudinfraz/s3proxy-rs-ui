#!/usr/bin/env bash
set -euo pipefail

npm run lint
npm run test:coverage
npm run test:deploy
npm run test:release
npm run build
