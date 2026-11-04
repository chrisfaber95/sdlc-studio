---
name: containerize
description: "Procedure for containerizing an app: a multi-stage Dockerfile with a pinned base image, non-root user, .dockerignore, lockfile installs, signal handling and healthcheck, plus a docker-compose setup for local development, built and checked locally. Followed by the devops-engineer agent; in a main session, delegate container work to that agent."
argument-hint: "<app or service to containerize>"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

Containerize: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the
devops-engineer subagent, state the assumption and return the question. Build and run locally
only; do not push images or deploy.

## Steps

1. Read how the app builds and starts: runtime and version, package manager and lockfile,
   build step, start command, port, required environment variables, and files it needs at
   runtime. Check for an existing Dockerfile or compose file and extend it.
2. Write the Dockerfile as a multi-stage build:
   - a pinned base image tag from the official image (for example a specific `node` major and
     variant), not `latest`
   - copy the package manifests and lockfile first and install from the lockfile (`npm ci`) so
     the dependency layer is cached, then copy the source and build
   - a final stage that copies only what runs: production dependencies (`npm ci --omit=dev` in
     that stage, or pruned) and the build output
   - run as a non-root user, set `NODE_ENV=production` where it applies, `EXPOSE` the port, and
     add a `HEALTHCHECK` that calls a real endpoint if the app has one
   - start the app with the runtime directly (`CMD ["node", "server.js"]`) instead of through
     `npm start`, so termination signals reach the process; use `exec` form arrays
3. Write a `.dockerignore`: `node_modules`, build output, `.git`, `.env*`, logs, test and
   editor files. A missing `.dockerignore` sends secrets and junk into the build context.
4. Secrets: never `COPY` `.env` files, never put secrets in `ARG` or `ENV` (they stay in image
   layers and metadata). Pass runtime configuration as environment variables at run time, and
   use build secrets (`RUN --mount=type=secret`) if a build step truly needs one.
5. Local development with docker-compose: a service for the app with the right build context,
   ports, `env_file` pointing at an untracked file with an `.env.example` committed, and
   dependent services (a database image with a pinned version and a named volume, healthchecks,
   `depends_on` with `condition: service_healthy`). Mount source code as a volume only for a
   dev profile that runs the dev server; keep it separate from the production image.
6. Keep images small and fast: slim or alpine base only if the app's native modules work with
   it (alpine uses musl; check), order layers from least to most frequently changed, and avoid
   installing build tools in the final stage.
7. Verify locally if Docker is available: `docker build` the image, `docker compose config` to
   validate the compose file, run the container briefly with test configuration, hit the health
   endpoint, confirm the container stops cleanly on `docker stop` (a slow stop means signals are
   not handled), and check it runs as non-root (`docker exec <c> id`). Then stop and remove the
   containers you started. If Docker is not available, say so and mark the result unverified.
8. Report: files created, base image and why, the commands to build and run, the environment
   variables the container needs, the verification results, and anything a human must decide
   (registry, deployment target).
