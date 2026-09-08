# Logout revocation recovery

## Purpose

Operators must remain outside the protected control plane when server-side
session revocation cannot be confirmed, while retaining a safe way to retry
revocation without entering an API key again.

## Requirements

### UI078-01 Fail-closed logout

- Local CSRF and query state is cleared after every logout attempt.
- A failed `DELETE /admin/session` is recorded above the route boundary before
  navigation to Sign in.
- Protected routes do not render while revocation remains unresolved.
- The UI does not describe an unconfirmed revocation as a successful logout.

### UI078-02 Pending-revocation lifetime

- A non-secret pending marker survives navigation and reload in the same tab.
- The marker never contains a cookie, API key, CSRF token, response body, or
  server error detail.
- Other tabs are not treated as proof that revocation succeeded or failed.

### UI078-03 Controlled retry

- Sign in is unavailable while revocation remains unresolved.
- Retry first reads the authoritative session endpoint without rendering the
  protected application.
- An unauthenticated response resolves the pending state.
- An authenticated response supplies an in-memory CSRF token only long enough
  to retry `DELETE /admin/session`.
- CSRF state is cleared after every retry outcome.

## Acceptance scenarios

1. Fail logout, arrive at Sign in with a persistent warning, and reject direct
   navigation to every protected route.
2. Reload the warning, retry against an authenticated session, and clear the
   marker only after deletion succeeds.
3. Retry when session verification reports unauthenticated and clear the marker
   without issuing another deletion.
4. Fail retry and retain both the blocked state and a usable retry action.
5. Verify browser storage and displayed errors contain no secret material or
   private server response text.

## API assumptions

- `GET /admin/session` returns a fresh CSRF token for an authenticated cookie or
  reports that the session is unauthenticated.
- `DELETE /admin/session` requires that CSRF token and returns `204` only after
  server-side revocation is complete.