---
name: artifact-schemas
description: "The shape of the artifacts sdlc-studio generates and stores (idea, requirements, architecture, test plan, scaffold) and of a project and its versions. Use when writing a generation prompt, a validator, a storage model, an API type or a test that touches an artifact."
---

Source: brief H-013 (written for H-013). Field names below are the contract between stages; the first build task
may rename them, but then updates this skill in the same PR. Do not add facts that are not in the brief.

## Project and lifecycle
- A project is created when the owner chooses an idea; it starts in stage `ideate`.
- Stages, in order: ideate, spec, design, build, ship, retro (exact names may still change; keep them in one enum).
- Moving a stage persists across reloads. A project can be marked as an example; only examples are visible to visitors.

## Artifacts
Stages run in this order, each reading the previous one: idea -> requirements -> architecture -> test plan -> scaffold.
Every artifact is stored with: project id, kind, version number, the extra prompt used (if any), the tier that made it
(`local` or `claude`), created-at, and its content. Regenerating adds a new version; older versions stay viewable.
A failed generation stores nothing and never removes earlier artifacts.

- **Idea**: title, summary, effort estimate, novelty score, skill tags. A request returns at least 3 ideas for a
  stack (TypeScript, Python, Go, Rust, Vue, Angular), a topic and an effort level.
- **Requirements**: user stories; each has at least one testable acceptance criterion, with a stable id.
- **Architecture**: components, a data model, at least one decision record, and at least one diagram (rendered).
- **Test plan**: test cases, each linked to acceptance criterion ids; plus one CI workflow file.
- **Scaffold**: files for the chosen stack, one scaffold per each of the six stacks.
- **Download**: one ZIP with spec, architecture, tests and scaffold of the project.

## Rules
- Generated content must be validated against these shapes before it is stored; an invalid result counts as a failed generation.
- Visitors read artifacts only; the server refuses every write call for them (not just hidden in the UI).
