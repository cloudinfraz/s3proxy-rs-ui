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
git switch -c release/v0.6.4

npm version 0.6.4 --no-git-tag-version
```

Move completed entries from `Unreleased` into a dated changelog heading:

```markdown
## [0.6.4] - 2026-10-01
```

Validate and push the candidate:

```bash
node scripts/release/prepare-release.mjs 0.6.4
make check
git add package.json package-lock.json CHANGELOG.md
git commit -m "release: prepare v0.6.4"
git push -u origin release/v0.6.4
```

Open a pull request from `release/v0.6.4` to `main`. Opening and updating the PR
triggers the release-candidate gate, which validates metadata and the API
contract, runs all local checks and browser acceptance, creates a reproducible
static archive, and verifies the runtime image.

## Publish

Merge the approved release pull request. The merged event automatically:

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

## Publish v0.6.3

Version `0.6.3` was merged before the release workflow existed and did not use a
`release/v0.6.3` branch. After this workflow is merged into `main`, open
**Actions > Release > Run workflow**, select `main`, enter `0.6.3`, and run it.

Manual dispatch still verifies that the selected revision belongs to `main` and
that the package, lockfile, and changelog versions agree. It cannot publish an
unmerged feature-branch revision.

## Failure and retry behavior

No GitHub Release is created until build, verification, scanning, SBOM creation,
and signing succeed. If a run fails before release creation, fix the cause on a
new pull request and manually rerun the workflow from the corrected `main`
revision using the same version. If the GitHub Release already exists, prepare a
new patch version rather than replacing published artifacts.