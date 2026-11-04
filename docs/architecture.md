# Architecture and access model

## Layout
- `backend/`: Fastify + SQLite (`node:sqlite`) in TypeScript. `src/config.ts` (env), `src/db/` (schema, store),
  `src/router/` (router client), `src/http/` (roles, routes).
- `frontend/`: Vue 3 + Vite app (`src/views`, `src/components`, `src/api.ts`). In development Vite proxies `/api` to the
  backend. The UI decides what to show from `GET /api/me`; the permission itself is enforced by the server.

## Data
- `projects`: id, title, stack, stage (`ideate|spec|design|build|ship|retro`), is_example.
- `artifacts`: project, kind, version, content, prompt, tier (`local|claude`), created_at. Append-only: database
  triggers refuse UPDATE and DELETE, so a regeneration is a new version.

## Router
Every generation goes through the homelab LLM router (H-012) via `RouterClient`. `HttpRouterClient` is the real
implementation, `StubRouterClient` is for tests. Each result carries the tier that served it; failures are a typed
`RouterError` (`unavailable`, `timeout`, `unauthorized`, `rejected`, `bad_response`). The tier per stage is one table:
`STAGE_TIERS` in `backend/src/router/prompts.ts`. The client speaks the router's `POST /v1/route` (H-012,
`docs/router.md` in homelab): our tier `local` is router tier `easy`, `claude` is `hard`, and the tier stored on an
artifact is the router's `backend` that actually answered. The app has no Claude API key setting; `ANTHROPIC_API_KEY` is ignored.

## Generation pipeline
Artifact shapes and their validators live in `backend/src/pipeline/artifact-schemas.ts`; prompt recipes, the tier
per stage and the citation rules in `backend/src/router/prompts.ts`; the ordering logic in
`backend/src/pipeline/service.ts`. Router output is parsed as JSON and validated before anything is stored; an
invalid answer or a router failure stores nothing (HTTP 502, 504 on timeout, with a `router_*` or `invalid_output`
code). Citations come only from the router. Stages are strictly ordered: idea, requirements, architecture, test
plan, scaffold; a stage reads the latest version of the one before (the test plan also checks its links against the
requirements). The scaffold is built from the test plan plus the requirements and
architecture. Its depth is hello world plus project structure, build/test config, a README and one passing placeholder
test (proposed default, adjustable in `SCAFFOLD_HINTS`). The validator checks per stack that the build manifest and a
test file exist, and refuses unsafe paths (`..`, absolute) and the paths the ZIP fills itself (`docs/`,
`.github/workflows/`, `artifacts.json`).

| Endpoint | Purpose |
| --- | --- |
| `POST /api/ideas` `{stack, topic, effort, prompt?}` | At least 3 ideas, nothing stored |
| `POST /api/projects/from-idea` `{stack, idea, tier?, prompt?}` | Creates a project in stage `ideate` with the idea as version 1 |
| `POST /api/projects/:id/generate/:kind` `{prompt?}` | `requirements`, `architecture`, `test_plan` or `scaffold`; adds a new version |
| `GET /api/projects/:id/artifacts[?kind=]`, `GET /api/projects/:id/artifacts/:kind/:version` | All versions, one version |
| `GET /api/projects/:id/download` | One ZIP with the latest version of every artifact (see below); visitors may for examples |
| `GET /api/projects`, `PATCH /api/projects/:id` `{stage}` | Board list; move a project (owner only) |

## ZIP download
`<title-slug>/docs/{idea,requirements,architecture,test-plan}.md`, `docs/diagrams/NN-title.mmd` (one per diagram),
the CI workflow at its own path (`.github/workflows/ci.yml`), the scaffold files at the root, and `artifacts.json`
(version, tier and extra prompt per artifact). Stages not generated yet are left out. The ZIP is written by
`src/pipeline/zip.ts` (no dependency).

## Roles
- **Owner**: a request with `Authorization: Bearer <SDLC_OWNER_TOKEN>`, or a `Tailscale-User-Login` header (set by
  Tailscale Serve) naming a login in `SDLC_OWNER_IDENTITIES`. Identity headers are only trusted from a loopback
  peer, because a tailnet peer connecting directly could forge them.
- **Visitor**: everyone else. May only GET example projects and their artifacts (others answer 404). Every POST, PUT,
  PATCH and DELETE from a non-owner is refused with 403 by a server-side hook, before routing.

## Terminal client and `/new-project`
`backend/src/client/studio-client.ts` is a typed client of the HTTP API (`SDLC_URL`, `SDLC_OWNER_TOKEN`);
`cli.ts` wraps it for the `/new-project` skill (`.claude/skills/new-project`). It holds no generation logic, so
projects made there are ordinary projects with the same artifacts, versions and tiers. Writes without the owner token
get 403. `backend/test/client.e2e.test.ts` drives idea to ZIP against a running backend with a stubbed router.

## Network exposure
The app is for the tailnet only and must not be reachable from the internet. It binds to `127.0.0.1` by default and
refuses `0.0.0.0`/`::`. Expose it with `tailscale serve` (never `tailscale funnel`) or bind it to the Tailscale
address. Do not forward the port on the router or open it in the firewall.

## End-to-end test
`e2e/` (`npm run e2e`) starts the real backend with an in-memory database and a stubbed router (`e2e/stub-server.ts`)
plus two Vite dev servers: one whose proxy authenticates as the owner (standing in for Tailscale Serve, since a plain
download link cannot carry a header) and one without credentials for the visitor. `studio.spec.ts` covers ideas,
choosing, all four stages, steering with version history, the ZIP contents, the board move after a reload, and the
visitor's read-only browsing and refused writes. `npm run screenshots` rewrites `docs/screenshots/` from the same setup.

## CI
`ci/pull-request.yml` runs lint, typecheck, tests and build, and the Playwright test as a second job, on every pull request. Copy it to
`.github/workflows/ci.yml` (the inbox cannot push workflow files).
