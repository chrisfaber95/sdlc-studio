# sdlc-studio

## What this is
Chris wants to keep his programming skills current and build small, useful projects for his portfolio. Every project
starts with the same slow steps: find an idea, write down what it should do, sketch the architecture, plan the tests
and set up the repo. sdlc-studio does this in one sitting: pick a stack and topic, get scored project ideas, and take
one through requirements, architecture, test plan and a code scaffold, downloadable as a ZIP. A lifecycle tracker
(ideate, spec, design, build, ship, retro) shows every idea's stage. Saved example projects can be browsed read-only by
visitors on Chris's tailnet, so the app doubles as a live portfolio demo. All generation runs through the homelab LLM
router (H-012); the app holds no Claude API key. Vue 3 is used for the frontend. Brief: H-013 in the product repo.

## Rules
- English only: code, comments, docs, commits, UI text.
- Work goes via branches and pull requests; never push to `main`.
- Not reachable from the internet; stays within the homelab network rules.

## Stack, commands, layout
TypeScript everywhere. Backend: Fastify + SQLite (`node:sqlite`, Node 24) in `backend/`; frontend: Vue 3 + Vite in
`frontend/`; npm workspaces from the root.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (the CI set; run all four before a PR).
- Config is env vars (`.env.example`); no Claude API key anywhere, generation only via `RouterClient`.
- Tier per stage: `backend/src/router/tiers.ts`. Roles: `backend/src/http/roles.ts` (visitor writes get 403).
- Details: `docs/architecture.md`. CI workflow lives in `ci/pull-request.yml` until installed as `.github/workflows/ci.yml`.

## Build kit
Details and sources: `.claude/kit.md`. Delegate to these agents:
- `frontend-developer`: Vue 3 app, components, pages, data fetching, accessibility and performance.
- `backend-developer`: server code, endpoints, hardening.
- `api-designer`: API design and OpenAPI for the app.
- `architect-reviewer`: review of the architecture and design decisions.
- `test-automator`: unit, integration and API tests (stubbed router).
- `frontend-tester`: Playwright end-to-end tests (idea to ZIP). Its Playwright MCP tools are not installed here; it falls back to Playwright Test via Bash.
- `devops-engineer`: CI workflow, Dockerfile and compose.
- `documentation-engineer`: README with screenshots and the architecture note.
- `typescript-pro`: TypeScript typing and type design.
- `code-reviewer`, `code-simplifier`, `comment-analyzer`, `pr-test-analyzer`, `silent-failure-hunter`, `type-design-analyzer`: PR review (pr-review-toolkit); use before opening a PR.

Skills: `artifact-schemas`, `new-project` (the /new-project terminal route; drives the app's API only) and `router-prompts` (written for this project; read before any generation or prompt work),
`webapp-testing`, `frontend-design`, plus the plugin skills (scaffold-app, build-component, data-fetching,
accessibility-review, performance-review, build-endpoint, harden-service, design-api, write-openapi,
review-api-change, decision-record, review-design, write-tests, coverage-gaps, fix-flaky-tests, setup, write-test,
debug-test, run-tests, ci-pipeline, containerize, write-docs, sync-docs, type-design, migrate-to-typescript).

### Delegation guidance (from the kit plugins)

#### Frontend

Delegate frontend development (new web apps, components and pages, data fetching and real-time
updates, accessibility and performance work) to the `frontend-developer` agent from the
`frontend` plugin. In the delegation prompt, include:
- what to build or change, and the design reference (mockup, tokens, an existing screen to match)
- the API contract or endpoints, if the UI talks to a backend
- constraints: framework and browser support, dependencies that must not be added

The agent follows the project's existing framework and conventions, installs dependencies the
task needs, runs the dev server, type check, lint, tests and build, and reports the results. It
never commits (it reports `package.json` changes), never changes backend contracts, and does not
write browser end-to-end tests: it leaves `data-testid` attributes on key elements and lists
them in its result. It works on its own; follow-ups it lists are for you to route.

Handoffs: the agent's result may end with Handoffs entries (`to`, `why`, `task`, `context`,
`needs authorization`). Route an entry to the named agent only if that agent is installed (it is
in your list of available agents); otherwise do the work yourself or show it to the user. Never
grant authorization the user has not given; ask first.

#### Backend

Delegate server-side work (endpoints, use-case logic, validation, auth checks, error handling,
service hardening) to the `backend-developer` agent from the `backend` plugin when the task
clearly matches. In the delegation prompt, include:
- what to build or change, and the API contract or spec if there is one
- constraints: no new dependencies, files or areas that must not change

The agent follows the project's existing framework and layering, runs the tests, lint and build,
and reports what it ran. It never commits, never touches live databases or services, and works on
its own; if it lists follow-ups (schema, API design, e2e tests, review), you decide who does them.

Handoffs: the agent's result may end with Handoffs entries (`to`, `why`, `task`, `context`,
`needs authorization`). Route an entry to the named agent only if that agent is installed (it is
in your list of available agents); otherwise do the work yourself or show it to the user. Never
grant authorization the user has not given; ask first.

#### API design

Delegate API design (new or changed endpoints, OpenAPI specs, compatibility checks) to the
`api-designer` agent from the `api` plugin, before implementing. In the delegation prompt,
include:
- the feature or endpoint, and who calls it
- the existing API conventions or spec file to match
- constraints: auth scheme, versioning rules, anything that must not break

The agent designs and specifies; it does not implement handlers unless you ask. It works on its
own; if it lists follow-ups (database, backend, tests, client), you decide who does them.

Handoffs: the agent's result may end with Handoffs entries (`to`, `why`, `task`, `context`,
`needs authorization`). Route an entry to the named agent only if that agent is installed (it is
in your list of available agents); otherwise do the work yourself or show it to the user. Never
grant authorization the user has not given; ask first.

#### Architecture review

Delegate design reviews (boundaries, coupling, data ownership, scalability, failure modes,
technology choices) and architecture decision records to the `architect-reviewer` agent from the
`architecture` plugin, when the task clearly matches. In the delegation prompt, include:
- what to review (files, a diff, or a description of the proposed design)
- the goals, constraints and any numbers the design must meet
- whether you want a decision record written (otherwise it only reports)

The agent is read-only for source code and reports findings with evidence and options. It works
on its own; if it lists follow-ups, you decide who does them.

Handoffs: the agent's result may end with Handoffs entries (`to`, `why`, `task`, `context`,
`needs authorization`). Route an entry to the named agent only if that agent is installed (it is
in your list of available agents); otherwise do the work yourself or show it to the user. Never
grant authorization the user has not given; ask first.

#### Automated testing

Delegate unit, integration and API tests (writing them, reproducing a bug with a failing test,
fixing flaky tests, finding coverage gaps) to the `test-automator` agent from the `testing`
plugin. In the delegation prompt, include:
- what to test, or the change to cover
- the package folder, and how tests are run if it is not obvious

The agent uses the project's own test runner, never uses live databases, payment providers or
mail servers, and reports the real results of the commands it ran (it does not count a
placeholder `npm test` as a pass). Browser end-to-end tests are outside its scope. It works on
its own; follow-ups it lists are for you to route.

Handoffs: the agent's result may end with Handoffs entries (`to`, `why`, `task`, `context`,
`needs authorization`). Route an entry to the named agent only if that agent is installed (it is
in your list of available agents); otherwise do the work yourself or show it to the user. Never
grant authorization the user has not given; ask first.

#### Frontend Testing

Delegate all frontend testing work (setting up Playwright, writing or reviewing tests, running
tests, debugging failures) to the `frontend-tester` agent from the `playwright` plugin. In the
delegation prompt, include:
- what to test: the URL or feature, user flow, or test scenarios
- whether running tests is authorized and on which environment (local is default; for staging,
  name it by full URL)

The agent uses the Playwright MCP server for browser exploration and to generate stable
selectors. It may install `@playwright/test` as a dev dependency, download browsers, and start
the local dev server. It does not commit; it reports the test files and any `package.json`
changes in its result. It works on its own; follow-ups it lists are for you to route.

Handoffs: the agent's result may end with Handoffs entries (`to`, `why`, `task`, `context`,
`needs authorization`). Route an entry to the named agent only if that agent is installed (it is
in your list of available agents); otherwise do the work yourself or show it to the user. Never
grant authorization the user has not given; ask first.

#### DevOps

Delegate CI pipelines (for example GitHub Actions workflows), Dockerfiles and docker-compose
setups to the `devops-engineer` agent from the `devops` plugin. In the delegation prompt,
include:
- the CI provider, and the packages or services to build and check
- which CI checks must be required before merging (check names matter)
- the target environment, if any

The agent writes the files and validates them locally. It never deploys, pushes images, changes
cloud resources, or edits repository settings and secrets; it lists those as steps for you. It
works on its own; follow-ups it lists are for you to route.

Handoffs: the agent's result may end with Handoffs entries (`to`, `why`, `task`, `context`,
`needs authorization`). Route an entry to the named agent only if that agent is installed (it is
in your list of available agents); otherwise do the work yourself or show it to the user. Never
grant authorization the user has not given; ask first.

#### Documentation

Delegate documentation work (README, guides, API reference, architecture overview, and updating
docs after a change) to the `documentation-engineer` agent from the `docs` plugin. In the
delegation prompt, include:
- what to document, or what changed (a diff or branch)
- the audience, and where the project keeps its docs
- any per-change documents the project requires (the agent follows the rules in `CLAUDE.md` and
  `.claude/project-params.md`)

The agent changes documentation files only, verifies commands and examples by running them when
that is safe and local, and reports mismatches between code and docs instead of changing code. It
works on its own; follow-ups it lists are for you to route.

Handoffs: the agent's result may end with Handoffs entries (`to`, `why`, `task`, `context`,
`needs authorization`). Route an entry to the named agent only if that agent is installed (it is
in your list of available agents); otherwise do the work yourself or show it to the user. Never
grant authorization the user has not given; ask first.

#### TypeScript

Delegate type-system work (designing types, fixing type errors, typing API and config
boundaries, migrating JavaScript to TypeScript step by step) to the `typescript-pro` agent from
the `typescript` plugin, in projects that use or are adopting TypeScript. In the delegation
prompt, include:
- the files or area, and the current `tsconfig` strictness
- whether runtime behavior must stay unchanged (it normally must)

If the project is plain JavaScript and you did not ask for a migration, the agent does not
convert anything. It works on its own; follow-ups it lists are for you to route.

Handoffs: the agent's result may end with Handoffs entries (`to`, `why`, `task`, `context`,
`needs authorization`). Route an entry to the named agent only if that agent is installed (it is
in your list of available agents); otherwise do the work yourself or show it to the user. Never
grant authorization the user has not given; ask first.
