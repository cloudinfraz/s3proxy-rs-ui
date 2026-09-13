#!/usr/bin/env bash
# Run credential-bearing UI-to-S3 authorization checks in the explicitly approved dev cluster.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXPECTED_KUBE_CONTEXT="${EXPECTED_KUBE_CONTEXT:?set EXPECTED_KUBE_CONTEXT}"
EXPECTED_CLUSTER_UID="${EXPECTED_CLUSTER_UID:?set EXPECTED_CLUSTER_UID to the kube-system namespace UID}"
[[ "${UI_LIVE_TEST_APPROVAL:-}" == "I_APPROVE_DEV_AKS_LIVE_MUTATION" ]] || {
  echo "ERROR: explicit user authorization is required for the credential-bearing AKS Job" >&2
  exit 1
}
NAMESPACE="${S3PROXY_NAMESPACE:-s3proxy}"
RUN_ID="$(date +%s)-$RANDOM"
JOB_NAME="s3proxy-ui-live-test-$RUN_ID"
MIGRATOR_JOB="s3proxy-ui-live-migrate-$RUN_ID"
REVOKE_JOB="s3proxy-ui-live-revoke-$RUN_ID"
ADMIN_KEY_SECRET="s3proxy-ui-live-key-$RUN_ID"
TLS_SECRET="s3proxy-ui-live-tls-$RUN_ID"
ADMIN_KEY_FIELD="ADMIN_API_KEY"
ADMIN_KEY_NAME="cloud-e2e"
LIVE_TEST_IMAGE="${LIVE_TEST_IMAGE:?set LIVE_TEST_IMAGE to an immutable ACR digest reference}"
CONTROL_DEPLOYMENT="${CONTROL_DEPLOYMENT:-s3proxy-control}"
MIGRATOR_SECRET="${MIGRATOR_SECRET:-s3proxy-migrator-secrets}"
UI_BASE_URL="${UI_BASE_URL:?set UI_BASE_URL to the in-cluster UI Service URL}"
CONTROL_BASE_URL="${CONTROL_BASE_URL:-http://s3proxy-control:8081}"
S3_ENDPOINT="${S3_ENDPOINT:?set S3_ENDPOINT to the authoritative in-cluster S3 data Service URL}"
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/target/deploy/ui-aks-live-test}"

kube() {
  kubectl --context "$EXPECTED_KUBE_CONTEXT" -n "$NAMESPACE" "$@"
}

key_provisioned=false
revoke_admin_key() {
  [[ "$key_provisioned" == true ]] || return 0
  cat <<EOF | kube apply -f - >/dev/null
apiVersion: batch/v1
kind: Job
metadata:
  name: $REVOKE_JOB
  labels:
    app.kubernetes.io/name: s3proxy-rs
    app.kubernetes.io/component: ui-live-test-revoke
spec:
  backoffLimit: 0
  activeDeadlineSeconds: 120
  template:
    metadata:
      labels:
        app.kubernetes.io/name: s3proxy-rs
        app.kubernetes.io/component: ui-live-test-revoke
        s3proxy.rs/access-ui: "true"
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        seccompProfile: {type: RuntimeDefault}
      containers:
        - name: revoke
          image: $LIVE_TEST_IMAGE
          command: ["node", "-e"]
          args:
            - |
              fetch(process.env.CONTROL_BASE_URL + '/admin/api-keys/cloud-e2e', {
                method: 'DELETE',
                headers: {authorization: 'Bearer ' + process.env.ADMIN_KEY},
              }).then(response => process.exit(response.status === 204 ? 0 : 1)).catch(() => process.exit(1))
          env:
            - {name: CONTROL_BASE_URL, value: "$CONTROL_BASE_URL"}
            - name: ADMIN_KEY
              valueFrom:
                secretKeyRef: {name: $ADMIN_KEY_SECRET, key: $ADMIN_KEY_FIELD}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: {drop: ["ALL"]}
          volumeMounts:
            - {name: tmp, mountPath: /tmp}
      volumes:
        - name: tmp
          emptyDir: {}
EOF
  kube wait --for=condition=complete "job/$REVOKE_JOB" --timeout=120s >/dev/null
  kube delete job "$REVOKE_JOB" --wait=true >/dev/null
  key_provisioned=false
}

cleanup() {
  kube delete job "$JOB_NAME" --ignore-not-found --wait=true >/dev/null
  revoke_admin_key >/dev/null 2>&1 || true
  kube delete job "$MIGRATOR_JOB" --ignore-not-found --wait=true >/dev/null
  kube delete job "$REVOKE_JOB" --ignore-not-found --wait=true >/dev/null
  kube delete secret "$ADMIN_KEY_SECRET" --ignore-not-found --wait=true >/dev/null
  kube delete secret "$TLS_SECRET" --ignore-not-found --wait=true >/dev/null
}
cleanup_on_exit() { cleanup >/dev/null 2>&1 || true; }
trap cleanup_on_exit EXIT
trap 'exit 130' INT TERM

for command in jq kubectl openssl sha256sum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: required command is unavailable: $command" >&2
    exit 1
  }
done
[[ "$(kubectl config current-context)" == "$EXPECTED_KUBE_CONTEXT" ]] || {
  echo "ERROR: kubectl context mismatch" >&2
  exit 1
}
[[ "$(kubectl --context "$EXPECTED_KUBE_CONTEXT" get namespace kube-system -o jsonpath='{.metadata.uid}')" == "$EXPECTED_CLUSTER_UID" ]] || {
  echo "ERROR: Kubernetes cluster identity mismatch" >&2
  exit 1
}
[[ "$LIVE_TEST_IMAGE" =~ ^[A-Za-z0-9-]+\.azurecr\.io/s3proxy-ui-live-test@sha256:[0-9a-f]{64}$ ]] || {
  echo "ERROR: LIVE_TEST_IMAGE must be an immutable s3proxy-ui-live-test ACR reference" >&2
  exit 1
}
[[ "$UI_BASE_URL" =~ ^http://[a-z0-9]([-a-z0-9.]*[a-z0-9])?:[0-9]{1,5}$ ]] || {
  echo "ERROR: UI_BASE_URL must be an in-cluster HTTP Service URL with an explicit port" >&2
  exit 1
}
[[ "$S3_ENDPOINT" =~ ^http://[a-z0-9]([-a-z0-9.]*[a-z0-9])?:[0-9]{1,5}$ ]] || {
  echo "ERROR: S3_ENDPOINT must be an in-cluster HTTP Service URL with an explicit port" >&2
  exit 1
}
[[ "$CONTROL_BASE_URL" =~ ^http://[a-z0-9]([-a-z0-9.]*[a-z0-9])?:[0-9]{1,5}$ ]] || {
  echo "ERROR: CONTROL_BASE_URL must be an in-cluster HTTP Service URL with an explicit port" >&2
  exit 1
}
kube auth can-i create jobs >/dev/null
kube auth can-i delete jobs >/dev/null
kube auth can-i create secrets >/dev/null
kube auth can-i delete secrets >/dev/null
kube get secret "$MIGRATOR_SECRET" -o json | jq -e '.data | has("APP_MIGRATOR_DATABASE__URL")' >/dev/null || {
  echo "ERROR: migrator database Secret is unavailable" >&2
  exit 1
}
CONTROL_IMAGE="$(kube get deployment "$CONTROL_DEPLOYMENT" -o jsonpath='{.spec.template.spec.containers[?(@.name=="control")].image}')"
[[ "$CONTROL_IMAGE" =~ ^[A-Za-z0-9-]+\.azurecr\.io/[A-Za-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] || {
  echo "ERROR: deployed control image must be an immutable ACR reference" >&2
  exit 1
}
[[ -z "$(kube get jobs -l 's3proxy.rs/admin-key-name=cloud-e2e' -o name)" ]] || {
  echo "ERROR: another cloud-e2e credential workflow is active" >&2
  exit 1
}
mkdir -p "$OUTPUT_DIR"

cert_dir="$(mktemp -d)"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=127.0.0.1' -addext 'subjectAltName=IP:127.0.0.1' \
  -keyout "$cert_dir/tls.key" -out "$cert_dir/tls.crt" >/dev/null 2>&1
kube create secret tls "$TLS_SECRET" --cert="$cert_dir/tls.crt" --key="$cert_dir/tls.key" \
  --dry-run=client -o yaml | kube apply -f - >/dev/null
rm -rf "$cert_dir"

admin_key="$(openssl rand -hex 32)"
admin_hash="$(printf '%s' "$admin_key" | sha256sum | awk '{print $1}')"
[[ "$admin_key" =~ ^[0-9a-f]{64}$ && "$admin_hash" =~ ^[0-9a-f]{64}$ ]] || {
  echo "ERROR: temporary administrator key generation failed" >&2
  exit 1
}
cat <<EOF | kube apply -f - >/dev/null
apiVersion: v1
kind: Secret
metadata:
  name: $ADMIN_KEY_SECRET
  labels:
    s3proxy.rs/purpose: ui-live-test
type: Opaque
stringData:
  $ADMIN_KEY_FIELD: "$admin_key"
EOF
unset admin_key

cat <<EOF | kube apply -f - >/dev/null
apiVersion: batch/v1
kind: Job
metadata:
  name: $MIGRATOR_JOB
  labels:
    app.kubernetes.io/name: s3proxy-rs
    app.kubernetes.io/component: ui-live-test-migrator
    s3proxy.rs/admin-key-name: cloud-e2e
spec:
  backoffLimit: 0
  activeDeadlineSeconds: 180
  ttlSecondsAfterFinished: 300
  template:
    metadata:
      labels:
        app.kubernetes.io/name: s3proxy-rs
        app.kubernetes.io/component: ui-live-test-migrator
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        seccompProfile: {type: RuntimeDefault}
      containers:
        - name: migrate
          image: $CONTROL_IMAGE
          command: ["/usr/local/bin/s3proxy-migrate"]
          args: ["upsert-e2e-admin-key"]
          env:
            - name: APP_DATABASE__URL
              valueFrom:
                secretKeyRef: {name: $MIGRATOR_SECRET, key: APP_MIGRATOR_DATABASE__URL}
            - {name: APP_DATABASE__RUN_MIGRATIONS, value: "false"}
            - {name: S3PROXY_E2E_ADMIN_KEY_HASH, value: "$admin_hash"}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: {drop: ["ALL"]}
          volumeMounts:
            - {name: tmp, mountPath: /tmp}
      volumes:
        - name: tmp
          emptyDir: {}
EOF
unset admin_hash
kube wait --for=condition=complete "job/$MIGRATOR_JOB" --timeout=180s >/dev/null || {
  echo "ERROR: temporary administrator key provisioning failed" >&2
  exit 1
}
key_provisioned=true

cat <<EOF | kube apply -f - >/dev/null
apiVersion: batch/v1
kind: Job
metadata:
  name: $JOB_NAME
  labels:
    app.kubernetes.io/name: s3proxy-rs
    app.kubernetes.io/component: ui-live-test
spec:
  backoffLimit: 0
  activeDeadlineSeconds: 600
  ttlSecondsAfterFinished: 300
  template:
    metadata:
      labels:
        app.kubernetes.io/name: s3proxy-rs
        app.kubernetes.io/component: ui-live-test
        s3proxy.rs/access-ui: "true"
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        seccompProfile: {type: RuntimeDefault}
      containers:
        - name: live-test
          image: $LIVE_TEST_IMAGE
          imagePullPolicy: IfNotPresent
          command: ["node", "-e"]
          args:
            - |
              const fs = require('node:fs');
              const http = require('node:http');
              const https = require('node:https');
              const {spawn} = require('node:child_process');
              const upstream = new URL(process.env.UPSTREAM_UI_URL);
              let child;
              const server = https.createServer({key: fs.readFileSync('/tls/tls.key'), cert: fs.readFileSync('/tls/tls.crt')}, (request, response) => {
                const forwarded = http.request({
                  hostname: upstream.hostname,
                  port: upstream.port,
                  path: request.url,
                  method: request.method,
                  headers: {...request.headers, 'x-forwarded-proto': 'https'},
                }, upstreamResponse => {
                  response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
                  upstreamResponse.pipe(response);
                });
                forwarded.on('error', () => { response.writeHead(502); response.end(); });
                request.pipe(forwarded);
              });
              server.listen(8443, '0.0.0.0', () => {
                child = spawn('./node_modules/.bin/playwright', ['test', '--config', 'e2e/config/playwright.live.config.ts'], {stdio: 'inherit', env: process.env});
                child.on('exit', code => server.close(() => process.exit(code ?? 1)));
              });
              process.on('SIGTERM', () => {
                child?.kill('SIGTERM');
                server.close(() => process.exit(143));
              });
          env:
            - {name: UPSTREAM_UI_URL, value: "$UI_BASE_URL"}
            - {name: UI_E2E_BASE_URL, value: "https://127.0.0.1:8443"}
            - {name: UI_E2E_CONTROL_BASE_URL, value: "$CONTROL_BASE_URL"}
            - {name: UI_E2E_S3_ENDPOINT, value: "$S3_ENDPOINT"}
            - {name: UI_E2E_REMOTE_MUTATION_ALLOWED, value: "1"}
            - name: UI_E2E_ADMIN_KEY
              valueFrom:
                secretKeyRef: {name: $ADMIN_KEY_SECRET, key: $ADMIN_KEY_FIELD}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: {drop: ["ALL"]}
          volumeMounts:
            - {name: tls, mountPath: /tls, readOnly: true}
            - {name: tmp, mountPath: /tmp}
      volumes:
        - name: tls
          secret: {secretName: $TLS_SECRET}
        - name: tmp
          emptyDir: {}
EOF

result=running
for _ in {1..300}; do
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
  grep -E '^(Running|  [0-9]+\)|  ✓|  ✘|[[:space:]]*[0-9]+ (passed|failed)|Error: Live)' "$log_file" >&2 || true
  echo "ERROR: in-cluster live UI test Job $result; sensitive diagnostics suppressed" >&2
  exit 1
fi
grep -E '[0-9]+ passed' "$log_file" >"$OUTPUT_DIR/pass.txt"
[[ "$(grep -Eo '[0-9]+ passed' "$OUTPUT_DIR/pass.txt" | tail -1)" == "4 passed" ]] || {
  echo "ERROR: in-cluster live UI test omitted pass evidence" >&2
  exit 1
}
! grep -Eq '[0-9]+ (failed|skipped)' "$log_file" || {
  echo "ERROR: in-cluster live UI test was incomplete" >&2
  exit 1
}

jq -n \
  --arg image "$LIVE_TEST_IMAGE" \
  --arg context "$EXPECTED_KUBE_CONTEXT" \
  '{schema_version:1,image:$image,context:$context,result:"passed"}' \
  >"$OUTPUT_DIR/evidence.json"

revoke_admin_key
cleanup
[[ "$(kube get job "$JOB_NAME" --ignore-not-found -o name)" == "" ]] || {
  echo "ERROR: credential-bearing live test Job cleanup failed" >&2
  exit 1
}
trap - EXIT INT TERM
echo "In-cluster live UI data-plane Job completed successfully."
echo "Evidence: $OUTPUT_DIR/evidence.json"