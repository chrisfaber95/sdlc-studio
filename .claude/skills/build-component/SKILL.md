---
name: build-component
description: "Procedure for building or changing a frontend component, page or feature: match the project's conventions, type the API, cover loading/empty/error states, responsive layout, accessibility, data-testid hooks, and unit tests, then verify with type check, lint, tests and build. Followed by the frontend-developer agent; in a main session, delegate UI work to that agent."
argument-hint: "<component, page or feature to build or change>"
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep]
---

Build or change: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the
frontend-developer subagent, state the assumption and return the question.

## Steps

1. Read before writing: find two or three existing components similar to this one and copy their
   structure (file naming, props typing, styling approach, how they take data, how they are
   tested). Find the design reference in the request (mockup, tokens, an existing screen). Check
   whether a component for this already exists; extend it instead of duplicating it.
2. Define the component's API first: typed props (or `defineProps`/`@Input`/`input()`),
   emitted events or callbacks, and slots/children. Keep it small, with sensible defaults and no
   boolean-prop explosions (use a `variant` union instead). Types model the real states
   (`status: 'idle' | 'loading' | 'error' | 'success'` rather than separate flags).
3. Implement with the project's framework idioms, using the version it actually uses (check
   `package.json`): React function components with hooks, Vue `<script setup>` with the
   Composition API, Angular standalone components. Use the signals, control-flow or concurrent
   features only if that version supports them.
   - Keep state as local as possible; lift it only when siblings need it; use the project's
     existing store only for genuinely shared state.
   - Derive values instead of syncing them with effects. Clean up subscriptions and timers.
   - Do not memoize (`useMemo`, `React.memo`, `computed` tricks) without a measured problem.
4. Cover every state the UI can be in: loading, empty, error (with a retry or next step), and
   partial data. Disable submit buttons while submitting, and prevent double submits.
5. Styling: use the project's approach (CSS modules, Tailwind, styled components, tokens). Use
   design tokens or theme variables, not hard-coded colors and spacing. Make it responsive
   mobile-first; test the layout at narrow and wide widths by reading the CSS, and check the dev
   server if you can.
6. Accessibility from the start: native elements first (`button`, `a`, `input`, `label`,
   `nav`, `main`, headings in order), labels tied to inputs, visible focus, keyboard operable,
   alt text on meaningful images, ARIA only where native HTML cannot express it. Use the
   `accessibility-review` skill for a full pass on larger changes.
7. Test hooks: add a `data-testid` to key interactive and assertion points (follow the project's
   convention, otherwise `kebab-case` like `checkout-submit`). Keep them stable and do not
   encode styling in them. Say which ids exist in your report so end-to-end tests can use them.
8. Unit or component tests with the project's existing runner (Vitest or Jest with Testing
   Library, Angular's test bed): cover rendering, each state, user interaction and edge cases.
   Query by role, label or text the way a user would, not by implementation details. Skip a
   test runner setup if none exists and say so; do not add one unasked.
9. Verify: run the project's type check, lint, the tests you touched, and the build if you
   changed config or dependencies. Fix what fails. If a command could not run, say why.
10. Report: files created and changed, the component's API and a short usage example, the
    states handled, the `data-testid`s, verification results, and open questions.
