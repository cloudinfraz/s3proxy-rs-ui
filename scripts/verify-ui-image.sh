#!/usr/bin/env bash
set -euo pipefail

: "${UI_IMAGE:?set UI_IMAGE to the built UI image}"

container=""
container_name=""
port=""
static_root="$(mktemp -d)"
cleanup() {
  rm -rf "$static_root"
  if [[ -n "$container_name" ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  elif [[ -n "$container" ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

container="$(docker create "$UI_IMAGE")"
files="$(docker export "$container" | tar -tf -)"

require_file() {
  local path="$1"
  if ! grep -Fxq "$path" <<<"$files"; then
    echo "ERROR: UI image is missing ${path}" >&2
    exit 1
  fi
}

reject_prefix() {
  local prefix="$1"
  if grep -Eq "^${prefix}" <<<"$files"; then
    echo "ERROR: UI image unexpectedly contains ${prefix}" >&2
    exit 1
  fi
}

require_file "usr/share/nginx/html/index.html"
require_file "etc/nginx/conf.d/default.conf"
reject_prefix "usr/local/bin/s3proxy-control$"
reject_prefix "usr/local/bin/s3proxy-migrate$"
reject_prefix "usr/local/bin/s3proxy-data$"
reject_prefix "usr/local/bin/s3proxy-rs$"

docker cp "$container:/usr/share/nginx/html/." "$static_root"
python3 - "$static_root" <<'PY'
import html.parser
import pathlib
import posixpath
import re
import sys
import urllib.parse

root = pathlib.Path(sys.argv[1]).resolve()
text_suffixes = {".css", ".html", ".js", ".mjs"}
asset_suffixes = {
  ".avif", ".css", ".gif", ".ico", ".jpeg", ".jpg", ".js", ".json",
  ".mjs", ".png", ".svg", ".webmanifest", ".woff", ".woff2",
}
remote = re.compile(r"^(?:https?:)?//", re.IGNORECASE)
telemetry = re.compile(
  r"google-analytics|googletagmanager|sentry\.io|Sentry\.init|"
  r"applicationinsights|appinsights|newrelic|datadog|mixpanel|amplitude|"
  r"navigator\.sendBeacon",
  re.IGNORECASE,
)
css_references = re.compile(
  r"url\(\s*(['\"]?)([^)'\"\s]+)\1\s*\)|"
  r"@import\s+(?:url\(\s*)?(['\"])([^'\"]+)\3",
  re.IGNORECASE,
)
javascript_remote = re.compile(
  r"(?:fetch|importScripts|sendBeacon)\s*\(\s*['\"](?:https?:)?//|"
  r"(?:src|href)\s*=\s*['\"](?:https?:)?//|"
  r"(?:import\s*(?:\(|[^;]*?from\s*))['\"](?:https?:)?//",
  re.IGNORECASE,
)
javascript_assets = re.compile(
  r"['\"]((?:(?:\.\.?/|/admin/ui/|/)?[^'\"?#\s]+)"
  r"\.(?:avif|css|gif|ico|jpe?g|js|json|mjs|png|svg|webmanifest|woff2?))"
  r"(?:[?#][^'\"]*)?['\"]",
  re.IGNORECASE,
)


class DocumentParser(html.parser.HTMLParser):
  def __init__(self):
    super().__init__()
    self.references = []

  def handle_starttag(self, tag, attrs):
    for name, value in attrs:
      if value is None:
        continue
      if name in {"href", "src", "action", "poster"}:
        self.references.append(value)
      elif name == "srcset":
        self.references.extend(item.strip().split()[0] for item in value.split(","))


def fail(message, path):
  print(f"ERROR: {message}: {path.relative_to(root)}", file=sys.stderr)
  raise SystemExit(1)


def resolve_reference(source, reference):
  reference = reference.strip()
  if not reference or reference.startswith(("#", "data:", "blob:")):
    return None
  if remote.match(reference):
    fail("UI asset graph contains a remote reference", source)
  parsed = urllib.parse.urlsplit(reference)
  path = urllib.parse.unquote(parsed.path)
  if not pathlib.PurePosixPath(path).suffix.lower() in asset_suffixes:
    return None
  if path.startswith("/admin/ui/"):
    relative = path.removeprefix("/admin/ui/")
  elif path.startswith("/"):
    relative = path.removeprefix("/")
  else:
    relative = posixpath.join(source.relative_to(root).parent.as_posix(), path)
  normalized = posixpath.normpath(relative)
  if normalized == ".." or normalized.startswith("../"):
    fail("UI asset reference escapes the web root", source)
  return root / normalized


files = [path for path in root.rglob("*") if path.is_file()]
if not files:
  print("ERROR: UI image web root is empty", file=sys.stderr)
  raise SystemExit(1)

references = []
for path in files:
  if path.suffix.lower() not in text_suffixes:
    continue
  try:
    content = path.read_text(encoding="utf-8")
  except UnicodeDecodeError:
    fail("UI text asset is not valid UTF-8", path)
  if telemetry.search(content):
    fail("UI asset contains a telemetry integration", path)
  if path.suffix.lower() == ".html":
    parser = DocumentParser()
    parser.feed(content)
    references.extend((path, reference) for reference in parser.references)
  elif path.suffix.lower() == ".css":
    for match in css_references.finditer(content):
      references.append((path, match.group(2) or match.group(4)))
  else:
    if javascript_remote.search(content):
      fail("UI JavaScript contains a remote network reference", path)
    references.extend((path, match.group(1)) for match in javascript_assets.finditer(content))

for source, reference in references:
  target = resolve_reference(source, reference)
  if target is not None and (not target.is_file() or root not in target.resolve().parents):
    fail("UI asset graph references a missing local file", source)
PY

user="$(docker image inspect --format '{{.Config.User}}' "$UI_IMAGE")"
if [[ "$user" != "101" ]]; then
  echo "ERROR: ${UI_IMAGE} runs as '${user}', expected '101'" >&2
  exit 1
fi

ports="$(docker image inspect --format '{{json .Config.ExposedPorts}}' "$UI_IMAGE")"
if [[ "$ports" != *'8080/tcp'* ]]; then
  echo "ERROR: ${UI_IMAGE} does not expose port 8080" >&2
  exit 1
fi

revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$UI_IMAGE")"
if [[ -z "$revision" || "$revision" == "unknown" ]]; then
  echo "ERROR: ${UI_IMAGE} has no concrete OCI revision" >&2
  exit 1
fi
if [[ -n "${UI_EXPECTED_REVISION:-}" && "$revision" != "$UI_EXPECTED_REVISION" ]]; then
  echo "ERROR: ${UI_IMAGE} revision does not match UI_EXPECTED_REVISION" >&2
  exit 1
fi

docker rm "$container" >/dev/null
container=""
container_name="s3proxy-ui-verify-${RANDOM}-$$"
docker run -d --name "$container_name" --add-host s3proxy-control:127.0.0.1 \
  -p 127.0.0.1::8080 "$UI_IMAGE" >/dev/null
port="$(docker port "$container_name" 8080/tcp | awk -F: 'NR == 1 { print $NF }')"
if [[ -z "$port" ]]; then
  echo "ERROR: failed to determine UI image verification port" >&2
  exit 1
fi

base_url="http://127.0.0.1:${port}"
if ! curl --silent --show-error --fail --retry 10 --retry-all-errors --retry-delay 1 \
  --connect-timeout 2 --max-time 3 --retry-max-time 30 \
  --output /dev/null "${base_url}/healthz"; then
  echo "ERROR: UI image did not become healthy" >&2
  exit 1
fi

headers="$(curl --silent --show-error --dump-header - --output /dev/null "${base_url}/admin/ui/login")"
for required in \
  "Content-Security-Policy:.*frame-ancestors 'none'" \
  "X-Content-Type-Options: nosniff" \
  "Referrer-Policy: no-referrer" \
  "X-Frame-Options: DENY" \
  "Cache-Control: no-store"; do
  if ! grep -Eiq "^${required}" <<<"$headers"; then
    echo "ERROR: UI response is missing required header ${required%%:*}" >&2
    exit 1
  fi
done

asset_count=0
while IFS= read -r -d '' packaged_asset; do
  relative="${packaged_asset#"$static_root"/}"
  asset="/admin/ui/${relative}"
  response_body="$(mktemp)"
  response_headers="$(mktemp)"
  if ! curl --silent --show-error --fail --path-as-is \
    --dump-header "$response_headers" --output "$response_body" "${base_url}${asset}"; then
    echo "ERROR: packaged UI asset is not served: ${asset}" >&2
    rm -f "$response_body" "$response_headers"
    exit 1
  fi
  if ! cmp -s "$packaged_asset" "$response_body"; then
    echo "ERROR: served UI asset does not match packaged content: ${asset}" >&2
    rm -f "$response_body" "$response_headers"
    exit 1
  fi
  cache_control="$(awk 'BEGIN { IGNORECASE=1 } /^Cache-Control:/ { sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit }' "$response_headers")"
  if [[ "$relative" == assets/* ]]; then
    if [[ "$cache_control" != *"public"* || "$cache_control" != *"immutable"* ]]; then
      echo "ERROR: fingerprinted UI asset lacks immutable caching: ${asset}" >&2
      rm -f "$response_body" "$response_headers"
      exit 1
    fi
  elif [[ "$cache_control" != *"no-store"* ]]; then
    echo "ERROR: mutable UI asset lacks no-store caching: ${asset}" >&2
    rm -f "$response_body" "$response_headers"
    exit 1
  fi
  if ! grep -Eiq '^X-Content-Type-Options:[[:space:]]*nosniff([[:space:]]|\r)*$' "$response_headers"; then
    echo "ERROR: UI asset lacks content-type protection: ${asset}" >&2
    rm -f "$response_body" "$response_headers"
    exit 1
  fi
  rm -f "$response_body" "$response_headers"
  asset_count=$((asset_count + 1))
done < <(find "$static_root" -type f -print0)

if (( asset_count == 0 )); then
  echo "ERROR: UI image contains no packaged static assets" >&2
  exit 1
fi

for rejected in /bucket /metrics; do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' "${base_url}${rejected}")"
  if [[ "$status" != "404" ]]; then
    echo "ERROR: ${rejected} returned ${status}, expected 404" >&2
    exit 1
  fi
done

echo "UI image contract verified for revision ${revision}."
