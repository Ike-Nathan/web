# API Authentication

Requests the web app makes to tx-watch-core (`NEXT_PUBLIC_API_URL`) through
`apiFetch` can carry credentials, so a core reachable from the browser does not
have to accept anonymous reads and writes of every user's contracts and
webhook URLs.

## Client behaviour

- Before each request, `apiFetch` asks the registered token provider
  (`lib/apiAuth.ts`) for an `Authorization` header value and sends it if one is
  returned. Credentials are only attached to relative (core) paths, never to
  absolute URLs.
- The default provider sends the API key entered in **Settings → API Key** as
  `Authorization: Bearer <key>`. The key is kept in `sessionStorage`, so it is
  not persisted across sessions or included in backups.
- Another scheme (for example a Freighter-signed challenge) can be plugged in:

  ```ts
  import { setAuthTokenProvider } from '@/lib/apiAuth'

  setAuthTokenProvider(async () => `Bearer ${await getSignedSessionToken()}`)
  ```

  Passing `null` disables credentials entirely.

- A `401` response dispatches a `txwatch:auth-required` window event. The app
  shows a toast prompting the user to re-authenticate, linking to Settings.
  The request still fails with an `ApiError` (`status: 401`).

## Expected server contract

| Aspect                                         | Requirement                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Header                                         | `Authorization: <scheme> <credentials>`; the built-in provider uses `Bearer <api key>`                                           |
| Scope                                          | Every `/contracts` and `/alerts` route requires a valid credential and only returns or modifies records owned by that credential |
| Missing / invalid / expired credential         | `401 Unauthorized` (optionally with `WWW-Authenticate`)                                                                          |
| Valid credential, record owned by someone else | `404 Not Found` (do not reveal existence) or `403 Forbidden`                                                                     |
| Rate limited / overloaded                      | `429` or `503` with `Retry-After` (seconds or HTTP-date); the alert poller waits at least that long                              |
| CORS                                           | Allow the `Authorization` request header for the web app's origin                                                                |

Error bodies may be JSON `{ "message": "..." }` or `{ "error": "..." }`, or
plain text; the message is surfaced to the user.
