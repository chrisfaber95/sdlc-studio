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
`STAGE_TIERS` in `backend/src/router/prompts.ts`. The router's wire format is assumed (see `src/router/http.ts`) until checked against
H-012's docs. The app has no Claude API key setting; `ANTHROPIC_API_KEY` is ignored.

## Generation pipeline
Artifact shapes and their validators live in `backend/src/pipeline/artifact-schemas.ts`; prompt recipes, the tier
per stage and the citation rules in `backend/src/router/prompts.ts`; the ordering logic in
`backend/src/pipeline/service.ts`. Router output is parsed as JSON and validated before anything is stored; an
invalid answer or a router failure stores nothing (HTTP 502, 504 on timeout, with a `router_*` or `invalid_output`
code). Citations come only from the router. Stages are strictly ordered: idea, requirements, architecture, test
plan; a stage reads the latest version of the one before (the test plan also checks its links against the
requirements). Scaffold generation is not implemented yet (501).

| Endpoint | Purpose |
| --- | --- |
| `POST /api/ideas` `{stack, topic, effort, prompt?}` | At least 3 ideas, nothing stored |
| `POST /api/projects/from-idea` `{stack, idea, tier?, prompt?}` | Creates a project in stage `ideate` with the idea as version 1 |
| `POST /api/projects/:id/generate/:kind` `{prompt?}` | `requirements`, `architecture` or `test_plan`; adds a new version |
| `GET /api/projects/:id/artifacts[?kind=]`, `GET /api/projects/:id/artifacts/:kind/:version` | All versions, one version |
| `GET /api/projects`, `PATCH /api/projects/:id` `{stage}` | Board list; move a project (owner only) |

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
