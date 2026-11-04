# Architecture and access model

## Layout
- `backend/`: Fastify + SQLite (`node:sqlite`) in TypeScript. `src/config.ts` (env), `src/db/` (schema, store),
  `src/router/` (router client), `src/http/` (roles, routes).
- `frontend/`: Vue 3 + Vite app shell. In development Vite proxies `/api` to the backend.

## Data
- `projects`: id, title, stack, stage (`ideate|spec|design|build|ship|retro`), is_example.
- `artifacts`: project, kind, version, content, prompt, tier (`local|claude`), created_at. Append-only: database
  triggers refuse UPDATE and DELETE, so a regeneration is a new version.

## Router
Every generation goes through the homelab LLM router (H-012) via `RouterClient`. `HttpRouterClient` is the real
implementation, `StubRouterClient` is for tests. Each result carries the tier that served it; failures are a typed
`RouterError` (`unavailable`, `timeout`, `unauthorized`, `rejected`, `bad_response`). The tier per stage is one table:
`backend/src/router/tiers.ts`. The router's wire format is assumed (see `src/router/http.ts`) until checked against
H-012's docs. The app has no Claude API key setting; `ANTHROPIC_API_KEY` is ignored.

## Roles
- **Owner**: a request with `Authorization: Bearer <SDLC_OWNER_TOKEN>`, or a `Tailscale-User-Login` header (set by
  Tailscale Serve) naming a login in `SDLC_OWNER_IDENTITIES`. Identity headers are only trusted from a loopback
  peer, because a tailnet peer connecting directly could forge them.
- **Visitor**: everyone else. May only GET example projects and their artifacts (others answer 404). Every POST, PUT,
  PATCH and DELETE from a non-owner is refused with 403 by a server-side hook, before routing.

## Network exposure
The app is for the tailnet only and must not be reachable from the internet. It binds to `127.0.0.1` by default and
refuses `0.0.0.0`/`::`. Expose it with `tailscale serve` (never `tailscale funnel`) or bind it to the Tailscale
address. Do not forward the port on the router or open it in the firewall.

## CI
`ci/pull-request.yml` runs lint, typecheck, tests and build on every pull request. Copy it to
`.github/workflows/ci.yml` (the inbox cannot push workflow files).
