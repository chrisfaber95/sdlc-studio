---
name: accessibility-review
description: "Procedure for auditing and fixing frontend accessibility against WCAG 2.2 AA: semantics, labels, keyboard operation, focus management, contrast, ARIA, motion, and forms, using lint rules and automated checks where available. Followed by the frontend-developer agent; in a main session, delegate accessibility work to that agent."
argument-hint: "<component, page or app to review>"
allowed-tools: [Bash, Read, Edit, Glob, Grep]
---

Review accessibility of: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the
frontend-developer subagent, state the assumption and return the question. Fix issues in the code
you were asked to review; list issues elsewhere without changing it.

## Steps

1. Run what the project has: the accessibility lint rules (`eslint-plugin-jsx-a11y`,
   `eslint-plugin-vuejs-accessibility`, Angular template rules) and any existing automated test
   (`jest-axe`, `vitest-axe`, `@axe-core/*`). Automated checks catch only part of the problems, so
   do the manual review below as well. Do not add a new testing dependency unasked.
2. Structure and semantics:
   - one `h1`, headings in order and describing sections; landmarks (`header`, `nav`, `main`,
     `footer`); lists as lists; tables with headers and captions
   - native elements for behaviour (`button` for actions, `a` for navigation); no clickable
     `div`/`span`. If a custom control is unavoidable, add the role, keyboard handling and states.
   - `lang` on the page, a skip link for repeated navigation, a meaningful page title that
     changes with the route
3. Names and labels: every control has an accessible name (visible `label`, `aria-label` only
   when no visible text fits). Icon-only buttons are labeled. Images have `alt` text that
   conveys purpose, and decorative ones have empty `alt`. Link text makes sense out of context.
4. Keyboard: every interaction is possible with the keyboard alone, in a logical tab order that
   matches the visual one (avoid positive `tabindex`). Focus is always visible and not hidden by
   `outline: none` without a replacement. Escape closes dialogs and menus. No keyboard traps.
5. Focus management: when a dialog opens, move focus into it, trap it there, and return focus to
   the trigger on close. After a route change or content update, move focus or announce it. Use
   the native `<dialog>` or the project's accessible dialog component when one exists.
6. Dynamic content: announce status changes (form errors, toasts, loading results) with
   `role="status"` or `aria-live="polite"` regions (use `assertive` only for urgent errors).
   Keep expanded or selected state in `aria-expanded`, `aria-selected`, `aria-current` in sync
   with the UI. ARIA is a last resort: wrong ARIA is worse than none.
7. Forms: labels tied to inputs, helpful `autocomplete` values, required state conveyed in text
   as well as `required`, errors associated with their field (`aria-describedby`) and not shown
   by color alone, focus moved to the first error on failed submit.
8. Color and motion: text contrast at least 4.5:1 (3:1 for large text and UI components such as
   borders and icons), compute it from the real token values when you can. Information is never
   conveyed by color alone. Respect `prefers-reduced-motion`. Content works at 200% zoom and at
   320 px width without horizontal scrolling, and touch targets are at least 24 by 24 CSS pixels
   (WCAG 2.2) or larger per the project's standard.
9. Report, grouped by severity (blocks use, hinders, polish), each with the file and line, what
   is wrong, who it affects, and the fix. State which fixes you applied and which you only
   listed. State what you could not verify: screen reader behaviour needs a real screen reader
   test, so say it was reviewed from the code and not tested with assistive technology.
