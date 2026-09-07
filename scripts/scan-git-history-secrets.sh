#!/usr/bin/env bash
set -euo pipefail

readonly GITLEAKS_VERSION="8.30.1"
readonly GITLEAKS_SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
readonly TRUFFLEHOG_VERSION="3.97.1"
readonly TRUFFLEHOG_SHA256="f863ea3a8d786f7d097870496c977944cce7372a2fe1e56707d965016e543ece"

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly TOOL_DIR="${SECRET_SCAN_TOOL_DIR:-$REPO_ROOT/.tools/secret-scan}"
readonly OUTPUT_DIR="${SECRET_SCAN_OUTPUT_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/s3proxy-rs-ui-secret-scan/$(date -u +%Y%m%dT%H%M%SZ)}"

fail() {
  echo "$1" >&2
  exit 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is unavailable: $1"
}

install_scanner() {
  local name="$1"
  local version="$2"
  local archive_name="$3"
  local checksum="$4"
  local repository="$5"
  local archive="$TOOL_DIR/$archive_name"

  if [[ -x "$TOOL_DIR/$name" ]]; then
    return
  fi

  mkdir -p "$TOOL_DIR"
  chmod 700 "$TOOL_DIR"
  curl --fail --silent --show-error --location \
    "https://github.com/$repository/releases/download/v$version/$archive_name" \
    --output "$archive"
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --strict >/dev/null
  tar -xzf "$archive" -C "$TOOL_DIR" "$name"
  chmod 700 "$TOOL_DIR/$name"
}

require_command curl
require_command git
require_command jq
require_command sha256sum
require_command tar

git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || fail "Not a Git repository: $REPO_ROOT"

case "$(realpath -m "$OUTPUT_DIR")/" in
  "$(realpath -m "$REPO_ROOT")/"*)
    fail "Secret scan output must be outside the repository."
    ;;
esac

install_scanner \
  gitleaks "$GITLEAKS_VERSION" "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
  "$GITLEAKS_SHA256" gitleaks/gitleaks
install_scanner \
  trufflehog "$TRUFFLEHOG_VERSION" "trufflehog_${TRUFFLEHOG_VERSION}_linux_amd64.tar.gz" \
  "$TRUFFLEHOG_SHA256" trufflesecurity/trufflehog

[[ "$($TOOL_DIR/gitleaks version)" == "$GITLEAKS_VERSION" ]] || fail "Unexpected Gitleaks version."
[[ "$($TOOL_DIR/trufflehog --version)" == "trufflehog $TRUFFLEHOG_VERSION" ]] || \
  fail "Unexpected TruffleHog version."

mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"

set +e
"$TOOL_DIR/gitleaks" git "$REPO_ROOT" \
  --log-opts='--all' \
  --redact=100 \
  --report-format=json \
  --report-path="$OUTPUT_DIR/gitleaks-redacted.json" \
  >"$OUTPUT_DIR/gitleaks.stdout" 2>"$OUTPUT_DIR/gitleaks.stderr"
gitleaks_status=$?

"$TOOL_DIR/trufflehog" git "file://$REPO_ROOT" \
  --results=verified,unknown \
  --json \
  --no-update \
  --fail \
  --fail-on-scan-errors \
  >"$OUTPUT_DIR/trufflehog-private.jsonl" 2>"$OUTPUT_DIR/trufflehog.stderr"
trufflehog_status=$?
set -e

printf '%s\n' "$gitleaks_status" >"$OUTPUT_DIR/gitleaks.status"
printf '%s\n' "$trufflehog_status" >"$OUTPUT_DIR/trufflehog.status"
chmod 600 "$OUTPUT_DIR"/*

gitleaks_count="$(jq 'length' "$OUTPUT_DIR/gitleaks-redacted.json")"
trufflehog_count="$(jq -s 'length' "$OUTPUT_DIR/trufflehog-private.jsonl")"
trufflehog_verified="$(jq -s '[.[] | select(.Verified == true)] | length' "$OUTPUT_DIR/trufflehog-private.jsonl")"

printf 'Gitleaks findings: %s\n' "$gitleaks_count"
printf 'TruffleHog findings: %s (verified: %s)\n' "$trufflehog_count" "$trufflehog_verified"
printf 'Private report directory: %s\n' "$OUTPUT_DIR"

if ((gitleaks_status != 0 || trufflehog_status != 0)); then
  echo "Secret scan requires private fingerprint review."
  exit 1
fi

echo "Full-history secret scan passed."
