#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly image="mcr.microsoft.com/playwright@sha256:b022639ae9197f864040f92eef7b57c6d4b47db2190f77c909d8a5d902dd4b7e"

docker run --rm --init --ipc=host --network none \
  --user "$(id -u):$(id -g)" \
  --workdir /work \
  --mount "type=bind,src=${repository_root},dst=/work" \
  --env HOME=/tmp \
  --env CI=true \
  "$image" \
  npm run test:e2e:cross-browser
