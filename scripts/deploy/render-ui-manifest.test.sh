#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

digest="sha256:$(printf 'a%.0s' {1..64})"
ACR_LOGIN_SERVER=example.azurecr.io UI_DIGEST="$digest" \
  OUTPUT_FILE="$TEMP_DIR/ui.yaml" "$ROOT/scripts/deploy/render-ui-manifest.sh" >/dev/null
grep -Fq "example.azurecr.io/s3proxy-ui@$digest" "$TEMP_DIR/ui.yaml"
! grep -Fq 'kind: NetworkPolicy' "$TEMP_DIR/ui.yaml"

ACR_LOGIN_SERVER=example.azurecr.io UI_DIGEST="$digest" NETWORK_POLICY_ENABLED=true \
  OUTPUT_FILE="$TEMP_DIR/ui-network-policy.yaml" "$ROOT/scripts/deploy/render-ui-manifest.sh" >/dev/null
grep -Fq 'kind: NetworkPolicy' "$TEMP_DIR/ui-network-policy.yaml"

if ACR_LOGIN_SERVER=example.azurecr.io UI_DIGEST=latest \
  OUTPUT_FILE="$TEMP_DIR/invalid.yaml" "$ROOT/scripts/deploy/render-ui-manifest.sh" >/dev/null 2>&1; then
  echo "invalid digest unexpectedly rendered" >&2
  exit 1
fi