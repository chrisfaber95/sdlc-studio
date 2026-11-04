---
name: new-project
description: "The /new-project terminal route for sdlc-studio: talk freely with the owner in a Claude CLI session and drive the app's API from a free-text description to a downloaded ZIP (ideas, requirements, architecture, test plan, scaffold). Use when building or changing this skill or its API client, or when the owner starts a project from the terminal."
---

Thin conversational client of the app's HTTP API. No generation logic here: the app generates through the homelab LLM
router and records the tier. Be terse; the conversation uses the owner's Claude allowance.

## Client
Run from the repo root; output is JSON. Env: `SDLC_URL` (app base URL), `SDLC_OWNER_TOKEN` (never print it).
`node --experimental-strip-types backend/src/client/cli.ts <cmd>`
- `ideas <stack> <effort> <topic...>`: stack typescript|python|go|rust|vue|angular, effort small|medium|large
- `choose <stack>`: the chosen idea JSON on stdin; creates the project in stage `ideate`
- `generate <id> <requirements|architecture|test_plan|scaffold> [extra prompt...]`: a repeat call, or one with a prompt, stores a new version
- `show <id> [kind]`, `projects`, `download <id> <path>`, `publish <id> [repo-name]` (new private GitHub repo; only if the owner asks, needs `SDLC_GITHUB_TOKEN` on the server)
Code: `backend/src/client/studio-client.ts` (typed `StudioClient`); shapes: skill `artifact-schemas`.

## Flow
1. From the owner's free text take stack, topic, effort; ask only for what is missing (one question).
2. `ideas`; list each as title, summary, effort, novelty, tags. The owner picks one; `choose`.
3. In order: `generate` requirements, architecture, test_plan, scaffold. After each, 2-4 lines (counts, key names) and the
   tier; ask "continue or steer?". Don't dump the JSON.
4. Steering: the owner's extra prompt goes verbatim as the prompt of `generate` for that stage (new version; earlier
   versions stay in `show`). Later stages are not redone unless asked.
5. `download <id> <path>` (default `./<title-slug>.zip`); say where it is.

## Rules
- A 403 means no owner access: tell the owner to set `SDLC_OWNER_TOKEN` and stop; never work around it.
- On a generation error (502/504, nothing stored) show it, keep earlier artifacts, offer a retry.
- Never write artifacts or files yourself except the ZIP.
- Projects made here are ordinary projects: they show on the board in their stage with the same artifacts and versions.
- Test: `backend/test/client.e2e.test.ts` (idea to ZIP, stubbed router). Keep it green when changing the client.
