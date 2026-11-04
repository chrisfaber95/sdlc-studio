---
name: performance-review
description: "Procedure for finding and fixing frontend performance problems from measurements: bundle size, load and runtime performance (Core Web Vitals), rendering and re-render cost, images, fonts and network. Followed by the frontend-developer agent; in a main session, delegate frontend performance work to that agent."
argument-hint: "<page, flow or symptom to investigate>"
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep]
---

Investigate performance of: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the
frontend-developer subagent, state the assumption and return the question. Measure before and
after every change. Report only numbers you measured; never estimate gains.

## Steps

1. State the symptom and the target: slow first load, slow interaction, janky scrolling, big
   download. Core Web Vitals are the reference points: LCP (loading), INP (interactivity), CLS
   (layout shift). If the request has no target, report the measurements without inventing one.
2. Measure a baseline:
   - bundle: run the production build and read the size report it prints, or use the bundler's
     analyzer if already installed (`vite-bundle-visualizer`, `@next/bundle-analyzer`,
     `webpack-bundle-analyzer`, `ng build --stats-json`). Note the largest chunks and
     dependencies.
   - runtime: if Lighthouse or Chrome is available, run `npx lighthouse <url> --only-categories=performance --output=json --quiet --chrome-flags="--headless"` against a production build served locally (not the dev server). Record LCP, INP or TBT, CLS and the main opportunities. If no browser is available, say the
     runtime numbers were not measured.
   - note the build mode and machine, since dev servers and slow machines distort results.
3. Find the cause from the measurements, in this order of usual payoff:
   - **too much JavaScript**: large dependencies (replace or import only what is needed),
     duplicated packages, code that is only needed on some routes. Fix with route-level and
     on-demand code splitting (`import()`, `React.lazy`, Vue async components, Angular lazy
     routes) and by deleting unused code and dependencies.
   - **images and fonts**: oversized or unoptimized images (use modern formats, correct
     dimensions, `srcset`/`sizes`, `loading="lazy"` below the fold, explicit `width` and `height`
     to prevent layout shift, and a preloaded or prioritized LCP image); fonts with
     `font-display: swap`, subsets, and `preload` for the critical one.
   - **network**: waterfalls from sequential requests (parallelize or fetch earlier), no
     caching headers or client cache, blocking third-party scripts (`defer`/`async`, or load
     after interaction).
   - **rendering**: components that re-render far more than needed, long lists without
     virtualization, expensive work in render, layout thrash, large DOM. Confirm with the
     framework's profiler or by instrumenting first, then fix at the source (move state down,
     split components, stabilize props, virtualize, `useMemo`/`React.memo`/`computed` only where
     the profile shows a cost).
   - **layout shift**: elements without reserved space, late-injected content, web-font swaps.
4. Make one change at a time, smallest effective fix first. Do not add a library to fix
   performance unless the measurements justify it. Do not trade away accessibility or
   correctness for speed.
5. Re-measure with the same method and conditions. Keep a change only if the numbers moved; revert
   it if not.
6. Verify nothing broke: type check, lint, tests, and the build. Check the changed route in the
   served build if you can.
7. Report: the symptom, the baseline and final measurements with how they were taken, each change
   and its measured effect, what you tried that did not help, and remaining issues with
   recommendations. Name what you could not measure (for example, real-device or field data).
