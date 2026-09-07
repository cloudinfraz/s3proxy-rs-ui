# Security Policy

## Supported versions

Security fixes are provided for the default branch and latest tagged release.

## Reporting a vulnerability

Do not report vulnerabilities in public issues, discussions, pull requests, or
chat. Open a [private GitHub Security Advisory](https://github.com/cloudinfraz/s3proxy-rs-ui/security/advisories/new).

Include the affected revision, browser and deployment mode, minimal reproduction,
and impact. Redact all credentials, tokens, signatures, account names, and
private endpoints.

## Sensitive browser artifacts

Never publish session cookies, CSRF tokens, admin API keys, screenshots, traces,
videos, request dumps, or Playwright error context from authenticated live tests.
Mocked browser tests must use synthetic values. Live tests must disable recording
and use disposable credentials and services.

If a credential may have entered Git history, CI output, test artifacts, or a
public report, stop affected work, rotate it through an operator-controlled
process, remove the exposed material, and scan the full rewritten history before
resuming.
