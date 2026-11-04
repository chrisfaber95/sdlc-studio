---
name: ci-pipeline
description: "Procedure for creating or changing a CI pipeline (GitHub Actions by default): triggers, one job per package, dependency caching, install from lockfile, lint test and build steps, least-privilege permissions, concurrency, timeouts, stable check names for merge gating, and local validation. Followed by the devops-engineer agent; in a main session, delegate CI work to that agent."
argument-hint: "<what the pipeline must build and check>"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

Create or change the CI pipeline for: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the
devops-engineer subagent, state the assumption and return the question. Write files; do not
change repository settings or secrets.

## Steps

1. Read the existing pipeline and the scripts it should run. Find the checks that exist locally
   for each package (`lint`, `test`, `build`, `typecheck`) and use exactly those. If a script
   does not exist or is a placeholder (for example a default `npm test` that prints "no test
   specified"), do not add a step that pretends to test; report it.
2. Identify the CI provider from the repo (default GitHub Actions) and the packages to cover.
   For several independent packages (each with its own `package.json` and lockfile) use one job
   per package with `defaults.run.working-directory`, or a matrix, and `paths` filters only if
   the project wants them; filters can skip required checks, so mention that risk.
3. Triggers: run on `pull_request` and on `push` to the default branch. Add `workflow_dispatch`
   if manual runs help. Use `concurrency` with `cancel-in-progress: true` for pull request runs
   so stale runs stop.
4. Permissions: set top-level `permissions: contents: read` and widen per job only where needed.
   Never use `pull_request_target` to run code from a pull request with secrets.
5. Steps per job: `actions/checkout`, then the runtime setup (for Node, `actions/setup-node`
   with the Node version from the project's version file or `engines`, and the built-in
   package cache), then install from the lockfile (`npm ci`, `pnpm install --frozen-lockfile`,
   `yarn install --immutable`), then lint, test and build in that order. Run tests with real
   test configuration: services such as a database come from `services:` containers, never from
   production, and secrets are not needed for pull request checks.
6. Reliability: `timeout-minutes` on each job, a pinned runner image tag if reproducibility
   matters more than updates, no `continue-on-error` on required checks, and artifacts (test
   reports, coverage) uploaded with a short retention only when useful.
7. Supply chain: use official actions, pin third-party actions to a full commit SHA, and keep
   versions updatable (Dependabot for `github-actions` and the package ecosystems if the project
   wants it). Do not run `curl | sh` installers.
8. Check names matter. If the project gates merging on CI check names, keep each job's `name`
   stable and descriptive (for example one job per package: "api", "web"). Renaming a
   job silently removes it from the required set. State the exact check names in your report.
9. Validate locally: check the YAML parses, and run `actionlint` if it is installed (do not
   install it globally); otherwise read the workflow against the syntax carefully and mark it
   unverified. Run the same commands the jobs run in the package folders to confirm they pass
   locally, and report the results.
10. Report: files changed, the jobs and their exact check names, what runs when, permissions,
    what you verified locally, what only real CI can confirm, and what a human must set up
    (required checks, secrets, environments).
