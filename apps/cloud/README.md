# @rivethub/cloud

The small service behind `rivethub.cloud`. It does three things.

- **Sign-in.** Email only, no password and no cookies. Both the `rh` CLI and the local web app call it server-to-server.
- **Telemetry intake.** Crash reports and anonymous usage counts, validated against the strict schemas in `@rivethub/contracts`. Anything that does not match is dropped with a 422 and never echoed back.
- **Update manifests.** Signed-in installs ask which release is latest and get its URL, sha256 and signature.

It is plain `node:http`, Postgres through `pg`, and Resend for email. There is no CORS, because browsers never call it directly.

## Sign-in flow

1. The client calls `POST /v1/auth/start` with `{email, installId}`. The service stores a hash of a random secret, valid for 15 minutes and usable once. It emails a link `PUBLIC_URL/verify?r=<id>&s=<secret>` and returns `{requestId, pollIntervalMs}`. The answer is the same whether or not the email has an account.
2. The user opens the link. `GET /verify` marks the request verified and shows "You're signed in. Go back to RivetHub." No script runs on the page.
3. Meanwhile the client polls `POST /v1/auth/poll` with `{requestId}`. It gets 202 while pending, 410 when expired or already used, and 200 `{installToken, email}` once verified. The token is returned once, stored only as a hash, bound to the install and the user. The user row is created on first sign-in.
4. The client sends `Authorization: Bearer <installToken>` on `GET /v1/account`, `DELETE /v1/account` (removes the user, every token and any stored email), `POST /v1/auth/signout` (revokes this token) and `GET /v1/updates/latest`.

Mail scanners that open links before the user does will verify the request early. That is harmless on its own, because the token still goes only to whoever holds the `requestId`.

## Telemetry

`POST /v1/telemetry/crash` and `POST /v1/telemetry/usage` need no auth. The body cap is 32 KB (413). Invalid JSON or any schema failure returns 422 with a fixed message. Valid reports return 202. Rate limits are in memory, per `installId` plus IP, with a coarse per-IP limit ahead of parsing. IP addresses are never stored or logged. Request logs hold method, path, status and duration only.

## Updates

`GET /v1/updates/latest?channel=stable|beta&os=<os>` returns `{version, url, sha256, signature, notesUrl}` for the highest version in the `releases` table, or 204 when there is none. Add a release by hand, with no network:

```
pnpm --filter @rivethub/cloud release:add --channel stable --os linux-x86_64 \
  --version 0.7.3 --url https://downloads.example/rh-0.7.3.tgz \
  --sha256 <64 hex> --signature <sig> --notes-url https://example/notes/0.7.3
```

Running it again for the same channel, os and version updates the row.

## Run locally

```
docker run -d --name rh-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=rivethub_cloud -p 127.0.0.1:5432:5432 postgres:16
export DATABASE_URL=postgres://postgres:pw@127.0.0.1:5432/rivethub_cloud
export PUBLIC_URL=http://127.0.0.1:8080
pnpm --filter @rivethub/cloud start
```

`.env.example` lists every variable. The service reads the process environment only, it does not load `.env` itself.

Without `RESEND_API_KEY` the service runs in dev mode. It logs the magic link as a JSON line on stdout and sends no email. Migrations in `migrations/*.sql` apply at start and are safe to run again.

## Tests

```
pnpm --filter @rivethub/cloud test
TEST_DATABASE_URL=postgres://postgres:pw@127.0.0.1:5432/test pnpm --filter @rivethub/cloud test
```

Route tests run against the in-memory store. With `TEST_DATABASE_URL` set, the same store contract also runs against Postgres. That run drops and recreates the `public` schema, so point it at a throwaway database.

## Layout

- `src/app.ts` holds the routes. `src/server.ts` wires config, Postgres, the mailer and shutdown.
- `src/store/types.ts` is the `Store` port. `memory.ts` and `postgres.ts` implement it.
- `src/mail.ts` has the Resend and dev mailers. `src/ratelimit.ts` has the in-memory limiter.
