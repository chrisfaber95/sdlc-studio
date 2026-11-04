---
name: router-prompts
description: "How sdlc-studio calls the homelab LLM router (H-012): which tier each stage uses, how prompts are built, how the extra owner prompt is applied, and the citation and error rules. Use when writing or changing any generation prompt or router call."
---

Source: briefs H-013 and H-012 (written for H-013). The router's exact request format is defined by H-012's build;
read its docs in the homelab repo before coding the client, and do not guess it.

## Rules from the briefs
- Every generation goes through the homelab LLM router with a caller name (`sdlc-studio`) and a declared tier.
  Callers declare the tier; the router does not classify.
- Tiers are `local` (local model) or `claude` (the `claude` CLI subscription). The app holds no Claude API key and
  never calls the Claude API directly. Tier names in H-012 are still open: keep the stage-to-tier map in one config table.
- Record on each stored artifact which tier made it.
- If the router is unavailable or a call fails: show an error, store nothing, keep earlier artifacts. Whether to
  escalate local to claude is a router config choice (H-012), not app logic.
- Tests use a stubbed router; never call the real one in tests.

## Prompt recipe (per stage)
1. System part: the stage's role and the output shape from the `artifact-schemas` skill; ask for structured output only.
2. Inputs: the previous stage's artifact (latest version) and the project's stack and topic.
3. Optional owner prompt, appended last and labelled as the owner's extra instruction. A regeneration with an extra prompt must be able to change the result.
4. Validate the response against the schema; on invalid output fail the generation (optionally one retry), do not store partial results.

## Tier per stage
Not fixed by the briefs. Start proposal for the first build task to confirm with Chris: ideas and requirements
`local`; architecture, test plan and scaffold `claude` (harder, longer output). Keep it changeable without code changes.

## Citations
Generated artifacts do not cite sources by default. Where a stage uses retrieved material (for example H-012 search),
keep the citation links the router returns and store them with the artifact; never invent a source.
