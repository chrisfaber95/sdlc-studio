# sdlc-studio

Chris's idea-to-scaffold workbench. Pick a stack and a topic, get scored project ideas, and take one through
requirements, architecture, test plan and a code scaffold in one sitting; download the result as a ZIP. A lifecycle
board (ideate, spec, design, build, ship, retro) shows every idea's stage, and saved example projects can be browsed
read-only by visitors on the tailnet, so the app doubles as a live portfolio demo. All generation runs through the
homelab LLM router (H-012); the app holds no Claude API key. The same flow works from a terminal with the
`/new-project` Claude skill.

## Screenshots
Captured from the running app against the real backend with a stubbed router (`npm run screenshots`).

| Idea list | Lifecycle board |
| --- | --- |
| ![Idea cards with effort, novelty and skill tags](docs/screenshots/ideas.png) | ![Board with six lifecycle columns](docs/screenshots/board.png) |

| Project view (architecture, version history, Mermaid diagram) | Visitor (read-only examples) |
| --- | --- |
| ![Project tabs, version history and diagram](docs/screenshots/project.png) | ![Visitor view without controls](docs/screenshots/visitor.png) |

## Setup
Needs Node 24.
```sh
npm ci
cp .env.example .env     # export the variables, or set them in your service unit
npm run build
node backend/dist/main.js    # the app (built UI + API) on http://127.0.0.1:8111
npm run dev -w frontend      # or: UI with hot reload on http://127.0.0.1:5173, proxies /api to the API
```
The owner is whoever sends `Authorization: Bearer $SDLC_OWNER_TOKEN` or, behind Tailscale Serve, a login listed in
`SDLC_OWNER_IDENTITIES`. Everyone else is a visitor and sees the example projects read-only.

### Environment variables
| Variable | Default | Meaning |
| --- | --- | --- |
| `SDLC_HOST` | `127.0.0.1` | Bind address; `0.0.0.0` and `::` are refused unless `SDLC_ALLOW_WILDCARD_BIND=1` |
| `SDLC_PORT` | `8111` | Port |
| `SDLC_ROUTER_URL` | `http://127.0.0.1:8018` | Homelab LLM router |
| `SDLC_ROUTER_TOKEN` | empty | Token for the router |
| `SDLC_OWNER_IDENTITIES` | empty | Comma separated Tailscale logins treated as owner (trusted only from a loopback peer) |
| `SDLC_OWNER_TOKEN` | empty | Bearer token that grants owner access (CLI skill, scripts) |
| `SDLC_DB_PATH` | `./data/sdlc-studio.db` | SQLite file |
| `SDLC_STATIC_DIR` | `frontend/dist` | Built UI served next to the API; without an `index.html` there the server is API only |
| `SDLC_URL` | none (required by the client) | Read by the `/new-project` client only: where the app runs, e.g. `http://127.0.0.1:8111` |

### Checks
`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` are the CI set (`npm run check` runs them all).
`npm run e2e` runs the Playwright test; install the browser once with `npx playwright install chromium`.

## Tailnet-only deployment
The app is not reachable from the internet. It binds to loopback by default; expose it with `tailscale serve`
(never `tailscale funnel`) or bind it to the Tailscale address. Do not forward the port on the router or open it in
the firewall. Visitors need access to the tailnet. Their writes are refused by the server (403), not just hidden in
the UI.

On the homelab box the app runs as `homelab-app-sdlc-studio.service` (unit and docs in the homelab repo,
`docs/projects.md`): the server listens on `127.0.0.1:8112`, and `tailscale serve` publishes it on the tailnet as
`http://homelab:8111`, adding the `Tailscale-User-Login` header that makes Chris the owner.

## Architecture
```
Vue 3 UI ─┐
          ├─> Fastify API ──> pipeline ──> RouterClient ──> homelab LLM router (H-012)
/new-project ─┘      │
                     └──> SQLite (projects, append-only artifact versions)
```
- **Backend** (`backend/`): Fastify in TypeScript. `http/` has the routes and the role check, `pipeline/` the stage
  ordering, validators and ZIP writer, `db/` the store.
- **Router client and tiers** (`backend/src/router/`): every generation goes through `RouterClient`; the real one
  calls the homelab router, a stub is used in tests. `STAGE_TIERS` in `prompts.ts` picks local or Claude per stage,
  and each artifact records the tier that made it. A router failure or invalid output stores nothing and earlier
  versions stay.
- **Storage**: SQLite via `node:sqlite`. Artifacts are append-only (triggers refuse UPDATE and DELETE), so steering a
  stage with an extra prompt adds a new version and the old ones stay viewable.
- **Frontend** (`frontend/`): Vue 3 + Vite, no router or store library. Hash routes for the board, the idea list and
  a project; the UI hides what a visitor may not do, the server enforces it.
- **`/new-project` skill** (`.claude/skills/new-project`): a terminal route that drives the same HTTP API through a
  typed client (`backend/src/client`). It has no generation logic, so projects made there appear on the board with the
  same artifacts, versions and tiers.
- **Tests**: Vitest for backend and frontend; `e2e/` has the Playwright test (browser, idea to downloaded ZIP, plus
  the visitor checks) against the real backend with a stubbed router.

More detail, the endpoint list and the ZIP layout: [docs/architecture.md](docs/architecture.md).
