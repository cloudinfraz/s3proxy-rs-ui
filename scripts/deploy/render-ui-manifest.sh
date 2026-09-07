#!/usr/bin/env bash
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly OUTPUT_FILE="${OUTPUT_FILE:-$REPO_ROOT/target/deploy/ui.yaml}"
readonly NETWORK_POLICY_ENABLED="${NETWORK_POLICY_ENABLED:-false}"

[[ "$NETWORK_POLICY_ENABLED" == "true" || "$NETWORK_POLICY_ENABLED" == "false" ]] || {
  echo "ERROR: NETWORK_POLICY_ENABLED must be true or false" >&2
  exit 1
}
for name in ACR_LOGIN_SERVER UI_DIGEST; do
  [[ -n "${!name:-}" ]] || { echo "ERROR: set ${name}" >&2; exit 1; }
done
[[ "$UI_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  echo "ERROR: UI_DIGEST must be an immutable sha256 digest" >&2
  exit 1
}
command -v kubectl >/dev/null || { echo "ERROR: kubectl is required" >&2; exit 1; }

overlay="$REPO_ROOT/deploy/k8s/ui"
[[ "$NETWORK_POLICY_ENABLED" == "false" ]] || overlay="$REPO_ROOT/deploy/k8s/ui-network-policy"
mkdir -p "$(dirname "$OUTPUT_FILE")"
kubectl kustomize "$overlay" \
  | sed "s|s3proxy-ui:split-image-must-be-overridden|${ACR_LOGIN_SERVER}/s3proxy-ui@${UI_DIGEST}|g" \
  > "$OUTPUT_FILE"
! grep -Fq 'split-image-must-be-overridden' "$OUTPUT_FILE" || {
  echo "ERROR: unresolved UI image" >&2
  exit 1
}
printf '%s\n' "$OUTPUT_FILE"