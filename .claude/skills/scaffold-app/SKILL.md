---
name: scaffold-app
description: "Procedure for starting a new frontend app: choose the framework, generate it non-interactively with the official tool, configure strict TypeScript, linting, formatting, scripts, env handling and folder structure, and verify it builds. Followed by the frontend-developer agent; in a main session, delegate new-app setup to that agent."
argument-hint: "<what the app is, framework if decided>"
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep]
---

Scaffold a frontend app for: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the
frontend-developer subagent, state the assumption and return the question. Only scaffold when the
request is for a new app; for an existing project, extend what exists instead.

## Steps

1. Choose the stack. Use what the request names. Otherwise decide from the need and say why:
   - mostly client-side app or dashboard: React or Vue with Vite
   - SEO, server rendering, or file-based routing: Next.js (React) or Nuxt (Vue)
   - large, structured, batteries-included: Angular
   - content site with little interactivity: Astro or plain HTML/CSS
   Use TypeScript unless told otherwise.
2. Generate it with the framework's official generator, in a new directory, and non-interactively.
   You cannot answer prompts, so run `<generator> --help` first to find the flags that preselect
   the template (for example Vite: `npm create vite@latest <name> -- --template react-ts`;
   Next.js: `npx create-next-app@latest <name>` with its flags; Vue: `npm create vue@latest`;
   Angular: `npx @angular/cli new <name>` with its flags). Never install tools globally.
3. Configure the new project (new projects only; never flip strictness flags on an existing
   codebase):
   - TypeScript: `strict` on, plus `noUncheckedIndexedAccess`; path alias (`@/` to `src/`) kept
     consistent between `tsconfig` and the bundler config.
   - ESLint with the framework's recommended rules and an accessibility plugin where one exists
     (`eslint-plugin-jsx-a11y`, `eslint-plugin-vuejs-accessibility`, Angular's template
     accessibility rules); Prettier or the formatter the framework ships with.
   - scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`. Add a unit test runner
     (Vitest for Vite projects, the framework default otherwise) with one passing sample test.
   - environment: `.env.example` with placeholders, real `.env*` files git-ignored, only
     deliberately public values exposed to the client.
4. Folder structure: group by feature (`src/features/<name>/`) with shared UI in
   `src/components/`, hooks/composables in `src/lib/` or the framework's convention, and API
   code in one place. Follow the generator's layout if it already has one.
5. Basics worth setting up now: a router if there is more than one screen, a single place for
   global styles and design tokens (CSS variables), an error boundary (or the framework's
   equivalent) and a 404 route, `lang` on the `<html>` element, and a responsive viewport meta tag.
6. Verify: install, then run `typecheck`, `lint`, `test` and `build`, and start the dev server
   once to confirm it serves (poll the URL, then stop the process you started). Report anything
   you could not run.
7. Write a short `README.md`: what the app is, how to run, build, test and lint, environment
   variables, and the folder layout. Only add Storybook if the request asks for it.
8. Report: the stack and why, the commands run, files created, the verification results, and
   dependencies added.
