---
name: new-project
description: "The /new-project terminal route for sdlc-studio: talk freely with the owner in a Claude CLI session and drive the app's API from a free-text description to a downloaded ZIP (ideas, requirements, architecture, test plan, scaffold). Use when building or changing this skill or its API client, or when the owner starts a project from the terminal."
---

Source: brief H-013 (written for H-013). The skill is a thin conversational client of the app's API. The API paths,
auth and client code are decided by the first build task; read the app's API spec before coding the client, and do
not guess endpoints.

## What the skill does
1. Take the owner's free-text description (stack, topic, effort); ask only for what is missing.
2. Call the app's API for ideas (at least 3) and present title, summary, effort, novelty and skill tags; the owner picks one.
3. Choosing an idea creates the project in stage `ideate`. Then, in order: requirements, architecture, test plan,
   scaffold. Show each result in short form and ask whether to continue or steer.
4. Steering: an extra prompt from the owner is passed to the app as the stage's extra prompt, which regenerates the
   stage as a new version (earlier versions stay viewable). Shapes: see the `artifact-schemas` skill.
5. At the end, download the project ZIP and tell the owner where it is saved.

## Rules
- No generation logic in the skill: it never writes artifacts itself. Every generation runs in the app through the
  homelab LLM router (see `router-prompts`) and records its tier; report that tier to the owner.
- A project made here must look the same on the board as one made in the web app: same stages, artifacts and versions.
- Use the owner's access only: if the app refuses a write call (no owner access), tell the owner and stop; never
  look for a way around it. Keep any token out of output, logs and the repo.
- If a generation fails or the router is unavailable, show the error, keep earlier artifacts and offer a retry.
- Be terse: the conversation uses the owner's Claude allowance (open question in the brief).
- The skill client needs an end-to-end test from idea to ZIP with a stubbed router.
