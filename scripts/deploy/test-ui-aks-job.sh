#!/usr/bin/env bash
# Validate the deployed UI from inside the cluster without credentials or port-forwarding.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXPECTED_KUBE_CONTEXT="${EXPECTED_KUBE_CONTEXT:?set EXPECTED_KUBE_CONTEXT}"
NAMESPACE="${S3PROXY_NAMESPACE:-s3proxy}"
DEPLOYMENT="${UI_DEPLOYMENT:-s3proxy-ui}"
JOB_NAME="${UI_TEST_JOB_NAME:-s3proxy-ui-deployed-test}"
CONFIG_NAME="${UI_TEST_CONFIG_NAME:-s3proxy-ui-deployed-test-script}"
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/target/deploy/ui-aks-test}"
UI_IMAGE="${UI_IMAGE:-}"
EXPECTED_OPENAPI_SHA256="${EXPECTED_OPENAPI_SHA256:-}"

kube() {
  kubectl --context "$EXPECTED_KUBE_CONTEXT" -n "$NAMESPACE" "$@"
}

cleanup() {
  kube delete job "$JOB_NAME" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  kube delete configmap "$CONFIG_NAME" --ignore-not-found --wait=true >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

for command in jq kubectl; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: required command is unavailable: $command" >&2
    exit 1
  }
done
[[ "$(kubectl config current-context)" == "$EXPECTED_KUBE_CONTEXT" ]] || {
  echo "ERROR: kubectl context mismatch" >&2
  exit 1
}
mkdir -p "$OUTPUT_DIR"
cleanup

if [[ -z "$UI_IMAGE" ]]; then
  UI_IMAGE="$(kube get deployment "$DEPLOYMENT" -o jsonpath='{.spec.template.spec.containers[?(@.name=="ui")].image}')"
fi
[[ "$UI_IMAGE" =~ ^[A-Za-z0-9-]+\.azurecr\.io/s3proxy-ui@sha256:[0-9a-f]{64}$ ]] || {
  echo "ERROR: UI_IMAGE must be an immutable ACR reference" >&2
  exit 1
}
if [[ -z "$EXPECTED_OPENAPI_SHA256" ]]; then
  EXPECTED_OPENAPI_SHA256="$(jq -er '.openapi_sha256' "$REPO_ROOT/contracts/backend-contract.json")"
fi
[[ "$EXPECTED_OPENAPI_SHA256" =~ ^[0-9a-f]{64}$ ]] || {
  echo "ERROR: EXPECTED_OPENAPI_SHA256 must be a lowercase SHA-256 value" >&2
  exit 1
}

test_script="$OUTPUT_DIR/test-ui.sh"
cat >"$test_script" <<'TEST'
#!/bin/sh
set -eu
base=http://s3proxy-ui:8080
work=/tmp/ui-deployed-test
mkdir -p "$work"

status() {
  output="$(wget --server-response -O /dev/null "$1" 2>&1 || true)"
  printf '%s\n' "$output" | awk '/  HTTP\// { code=$2 } END { print code }'
}

[ "$(status "$base/healthz")" = 200 ]
[ "$(status "$base/health")" = 200 ]
echo 'PASS health'

wget --server-response -O "$work/login.html" "$base/admin/ui/login" 2>"$work/login.headers"
grep -Eiq 'content-security-policy:.*frame-ancestors' "$work/login.headers"
grep -Eiq 'x-content-type-options:[[:space:]]*nosniff' "$work/login.headers"
grep -Eiq 'x-frame-options:[[:space:]]*DENY' "$work/login.headers"
grep -Eiq 'cache-control:.*no-store' "$work/login.headers"
echo 'PASS security-headers'

asset="$(grep -oE '/admin/ui/assets/index-[^" ]+\.js' "$work/login.html" | head -1)"
[ -n "$asset" ]
wget -q -O "$work/app.js" "$base$asset"
grep -Fq 'Next configuration findings page' "$work/app.js"
grep -Fq 'Previous configuration findings page' "$work/app.js"
echo 'PASS pagination-bundle'

[ "$(status "$base/admin/ui/readiness?limit=1")" = 403 ]
[ "$(status "$base/admin/ui/overview")" = 403 ]
echo 'PASS admin-auth-boundary'

wget -q -O "$work/openapi.json" "$base/admin/openapi.json"
[ "$(sha256sum "$work/openapi.json" | awk '{print $1}')" = "$EXPECTED_OPENAPI_SHA256" ]
echo 'PASS openapi-checksum'

[ "$(status "$base/bucket")" = 404 ]
[ "$(status "$base/metrics")" = 404 ]
echo 'PASS route-isolation'
TEST
chmod 700 "$test_script"

kube create configmap "$CONFIG_NAME" --from-file=test-ui.sh="$test_script" \
  --dry-run=client -o yaml | kube apply -f - >/dev/null
cat <<EOF | kube apply -f - >/dev/null
apiVersion: batch/v1
kind: Job
metadata:
  name: $JOB_NAME
  labels:
    app.kubernetes.io/name: s3proxy-rs
    app.kubernetes.io/component: ui-deployed-test
spec:
  backoffLimit: 0
  activeDeadlineSeconds: 180
  ttlSecondsAfterFinished: 300
  template:
    metadata:
      labels:
        app.kubernetes.io/name: s3proxy-rs
        app.kubernetes.io/component: ui-deployed-test
        s3proxy.rs/access-ui: "true"
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        runAsGroup: 101
        seccompProfile: {type: RuntimeDefault}
      containers:
        - name: test
          image: $UI_IMAGE
          command: ["/bin/sh", "/opt/ui-test/test-ui.sh"]
          env:
            - {name: EXPECTED_OPENAPI_SHA256, value: "$EXPECTED_OPENAPI_SHA256"}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: {drop: ["ALL"]}
          volumeMounts:
            - {name: test-script, mountPath: /opt/ui-test}
            - {name: tmp, mountPath: /tmp}
      volumes:
        - name: test-script
          configMap: {name: $CONFIG_NAME, defaultMode: 0555}
        - name: tmp
          emptyDir: {}
EOF

result=running
for _ in {1..90}; do
  result="$(kube get job "$JOB_NAME" -o json | jq -r '
    if any(.status.conditions[]?; .type == "Complete" and .status == "True") then "complete"
    elif any(.status.conditions[]?; .type == "Failed" and .status == "True") then "failed"
    else "running" end')"
  [[ "$result" == "running" ]] || break
  sleep 2
done

log_file="$OUTPUT_DIR/job.log"
kube logs "job/$JOB_NAME" --all-containers >"$log_file" 2>&1 || true
if [[ "$result" != "complete" ]]; then
  grep -E '^(PASS|ERROR|wget:|/bin/sh:)' "$log_file" >&2 || true
  echo "ERROR: in-cluster UI test Job $result" >&2
  exit 1
fi
grep -E '^PASS (health|security-headers|pagination-bundle|admin-auth-boundary|openapi-checksum|route-isolation)$' "$log_file" \
  | sort -u >"$OUTPUT_DIR/pass.txt"
[[ "$(wc -l <"$OUTPUT_DIR/pass.txt")" -eq 6 ]] || {
  echo "ERROR: in-cluster UI test omitted required evidence" >&2
  exit 1
}
cat "$OUTPUT_DIR/pass.txt"

jq -n \
  --arg image "$UI_IMAGE" \
  --arg openapi_sha256 "$EXPECTED_OPENAPI_SHA256" \
  '{schema_version:1,image:$image,openapi_sha256:$openapi_sha256,result:"passed"}' \
  >"$OUTPUT_DIR/evidence.json"

cleanup
trap - EXIT INT TERM
echo "In-cluster UI test Job completed successfully."
echo "Evidence: $OUTPUT_DIR/evidence.json"