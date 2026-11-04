# sdlc-studio

Pick a stack and topic, get scored project ideas, and take one through requirements, architecture, test plan and
a code scaffold. Generation runs through the homelab LLM router; the app holds no Claude API key. Saved example
projects can be browsed read-only by visitors on the tailnet. This is the project foundation: config, data layer,
router client and role middleware are in place; the generation flow comes next.

## Run
```sh
npm ci
cp .env.example .env   # then export the variables, or set them in your service unit
npm run build
node backend/dist/main.js            # API on http://127.0.0.1:8110
npm run dev -w frontend              # UI on http://127.0.0.1:5173, proxies /api
```
Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (the same as CI). Needs Node 24.

## Configuration
| Variable | Default | Meaning |
| --- | --- | --- |
| `SDLC_HOST` | `127.0.0.1` | Bind address; wildcard addresses are refused unless `SDLC_ALLOW_WILDCARD_BIND=1` |
| `SDLC_PORT` | `8110` | Port |
| `SDLC_ROUTER_URL` / `SDLC_ROUTER_TOKEN` | `http://127.0.0.1:8018` / empty | Homelab LLM router |
| `SDLC_OWNER_IDENTITIES` | empty | Comma separated Tailscale logins treated as owner |
| `SDLC_OWNER_TOKEN` | empty | Bearer token that grants owner access (CLI skill, scripts) |
| `SDLC_DB_PATH` | `./data/sdlc-studio.db` | SQLite file |

## Network
Only reachable through Tailscale, never from the internet. See [docs/architecture.md](docs/architecture.md).
