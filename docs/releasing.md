# Releasing

Releases are prepared on a `release/vX.Y.Z` branch and published from the
reviewed commit after its pull request is merged into `main`. Do not create or
push the release tag manually; the release workflow creates it at the merged
revision.

## One-time repository setup

In **Settings > Actions > General**, allow workflows to read and write repository
contents. The release job requests only these permissions:

- `contents: write` to create the tag and GitHub Release;
- `packages: write` to publish the GHCR image;
- `id-token: write` for keyless Cosign signing.

Protect `main` and require the **Validate release candidate** check for release
pull requests. After the first publication, set the
`ghcr.io/cloudinfraz/s3proxy-rs-ui` package visibility to public if the
organization does not inherit public visibility from this repository.

## Prepare a release branch

Start from the latest `main`. The branch name and package version must agree.

```bash
git switch main
git pull --ff-only origin main
git switch -c release/v0.6.5

npm version 0.6.5 --no-git-tag-version --allow-same-version
```

Move completed entries from `Unreleased` into a dated changelog heading:

```markdown
## [0.6.5] - 2026-10-01
```

Before validating the candidate, install the locked dependencies with `make install`
and run the same contract gate as CI. `make check` regenerates the API types but
does not check the pinned OpenAPI checksum or reject generated-schema drift:

```bash
set -euo pipefail
expected="$(node -p "require('./contracts/backend-contract.json').openapi_sha256")"
actual="$(sha256sum contracts/admin-openapi.json | awk '{print $1}')"
[[ "$actual" == "$expected" ]] || {
   echo "Pinned OpenAPI checksum does not match backend-contract.json" >&2
   exit 1
}
npm run generate:api
git diff --exit-code -- src/api/schema.d.ts
```

Validate and push the candidate:

```bash
node scripts/release/prepare-release.mjs 0.6.5
make check
git add package.json package-lock.json CHANGELOG.md
git commit -m "release: prepare v0.6.5"
git push -u origin release/v0.6.5
```

Open a pull request from `release/v0.6.5` to `main`. Opening and updating the PR
triggers the release-candidate gate, which validates metadata and the API
contract, runs all local checks and browser acceptance, creates a reproducible
static archive, and verifies the runtime image.

## Trigger a release

### Release branch trigger

Create the pull request after pushing the prepared branch:

```bash
gh pr create \
   --base main \
   --head release/v0.6.5 \
   --title "release: v0.6.5" \
   --body "Prepare s3proxy-rs UI v0.6.5."
```

Opening or updating the pull request runs **Validate release candidate** but
does not publish anything. Review the changes and wait for all required checks
to pass.

Merge the pull request to trigger publication automatically:

```bash
gh pr merge --merge --delete-branch
```

The workflow uses the pull request's merged event and publishes from the merge
commit on `main`. Do not manually create or push a version tag.

### Manual trigger

Use manual dispatch only when the version metadata and dated changelog entry are
already merged into `main`, such as when retrying a failed publication.

From GitHub, open **Actions > Release > Run workflow**, select `main`, enter the
version without the `v` prefix, and choose **Run workflow**.

The equivalent GitHub CLI commands are:

```bash
gh workflow run release.yml --ref main -f version=0.6.5
gh run list --workflow release.yml --event workflow_dispatch --limit 1
```

After the new run ID appears, monitor it with:

```bash
gh run watch RUN_ID --exit-status
```

Manual dispatch verifies that the selected revision belongs to `main` and that
the requested version, package, lockfile, and changelog entry agree. It cannot
publish an unmerged feature-branch revision.

## Published output

The release workflow automatically:

1. Repeats release validation at the merged revision.
2. Confirms that revision is contained in `origin/main`.
3. Builds and publishes `ghcr.io/cloudinfraz/s3proxy-rs-ui:vX.Y.Z` plus immutable
   revision and `latest` tags.
4. Generates BuildKit provenance and an SPDX SBOM.
5. Scans the published image for high and critical vulnerabilities.
6. Signs the image digest with keyless Cosign.
7. Creates the `vX.Y.Z` tag and GitHub Release from the matching changelog entry.

Each GitHub Release contains:

- `s3proxy-rs-ui-vX.Y.Z.tar.gz`, the static UI distribution;
- `s3proxy-rs-ui-vX.Y.Z.spdx.json`, the image SBOM;
- `SHA256SUMS` for both downloadable files;
- release notes extracted from `CHANGELOG.md`;
- the signed GHCR image digest in the release notes.

## v0.6.3 bootstrap release

Version `0.6.3` was published by manual dispatch because its metadata was merged
before the release workflow existed. Its release page is
[`v0.6.3`](https://github.com/cloudinfraz/s3proxy-rs-ui/releases/tag/v0.6.3).
Future versions should use the release branch trigger.

## Failure and retry behavior

No GitHub Release is created until build, verification, scanning, SBOM creation,
and signing succeed. Container tags may already have been pushed before a later
verification or signing step fails.

If a release-candidate PR is still open, push the fix to that branch to trigger
validation again. If the PR is already merged and no GitHub Release exists, merge
the fix through a new pull request, then use the [manual trigger](#manual-trigger)
from the corrected `main` revision with the same version. GitHub's **Re-run jobs**
uses the original revision and will not pick up a newly merged fix. The selected
revision must still contain matching package, lockfile, and changelog versions.

If the GitHub Release already exists, prepare a new patch version rather than
replacing published artifacts.

### Pinned OpenAPI checksum mismatch

If **Validate generated API contract** reports
`Pinned OpenAPI checksum does not match backend-contract.json`, verify the
checked-in OpenAPI file against the authoritative backend export at the intended
reviewed revision. Do not simply replace the checksum to bypass the gate.

Follow [Updating the backend contract](../CONTRIBUTING.md#updating-the-backend-contract):
record the verified full backend revision and checksum together, regenerate the
API types, and commit any resulting contract and schema changes. Run the contract
preflight above before retrying. A stale pin can require only a change to
`contracts/backend-contract.json` when the existing OpenAPI file and generated
types already match the verified backend export.