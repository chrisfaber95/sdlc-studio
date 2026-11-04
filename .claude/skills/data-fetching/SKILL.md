---
name: data-fetching
description: "Procedure for connecting a frontend to APIs: typed client, caching and request state with the project's existing library, mutations and forms, error handling, optimistic updates, and real-time updates over WebSocket or server-sent events with reconnection. Followed by the frontend-developer agent; in a main session, delegate API integration to that agent."
argument-hint: "<endpoint, data or real-time feature to wire up>"
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep]
---

Wire up data for: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the
frontend-developer subagent, state the assumption and return the question. Do not change the
backend; if the API does not fit the UI, report the gap.

## Steps

1. Find the API contract: an OpenAPI/GraphQL schema, shared types, existing API modules, or the
   backend routes in the repo. Use existing generated types or client code. If there is no
   contract, write the types from the real responses you can see and mark them assumptions.
2. Use what the project already uses for data (TanStack Query, SWR, RTK Query, Apollo, Angular
   `HttpClient` with signals or RxJS, Vue's composables). If there is none, plain `fetch` in a
   small typed client is enough for simple cases; propose a library only when caching,
   deduplication or pagination really call for it.
3. One typed API layer: a single module per resource that wraps `fetch` (base URL from env,
   JSON handling, auth header from the project's existing mechanism, abort signal support) and
   returns typed results. Components never build URLs or parse responses themselves. Validate
   untrusted response shapes at the boundary if the project already uses a schema library (Zod,
   Valibot).
4. Reads: model the request state explicitly (loading, error, success, empty). Cache and
   deduplicate through the library. Cancel in-flight requests when the input changes or the
   component unmounts. Keep server state out of general client state stores.
5. Writes and forms: validate on the client for usability and rely on the server for truth; show
   field-level server errors; disable submit while pending; invalidate or update the affected
   cache entries after success. Use optimistic updates only where a failure can be rolled back
   cleanly, and show an error when it is.
6. Errors: distinguish network failure, 4xx the user can fix, 401/403 (route to the existing
   sign-in flow), and 5xx (generic message with retry). Do not show raw server messages that may
   leak internals. Retry idempotent reads with backoff; never auto-retry non-idempotent writes.
7. Pagination and lists: use the API's cursor or page parameters; support infinite scroll or
   paging per the design; keep list keys stable; debounce search input.
8. Real-time (only if requested): prefer server-sent events for server-to-client streams and
   WebSocket for two-way. Implement one connection manager, outside components, that:
   - reconnects with exponential backoff and jitter, and resumes from the last event id or does
     a refetch to resync after a gap
   - exposes connection state (connecting, open, reconnecting, closed) to the UI
   - authenticates the way the backend expects, never by putting secrets in the URL
   - closes on logout and when no consumer is mounted
   - applies incoming events to the same cache the reads use, so the UI has one source of truth
   Handle out-of-order and duplicate events (use event ids or versions) and show presence or
   live indicators only if the design asks for them.
9. Secrets: no API keys in client code. Calls that need a secret go through the backend.
10. Verify: type check, lint, and tests. Test the API layer and state handling with the project's
    mocking approach (MSW or equivalent if already used; otherwise mock the module boundary).
    Run the app against a local backend if one is available and note what you saw.
11. Report: the API modules and hooks created, the types and where they came from, the
    error-handling behaviour, cache invalidation rules, any real-time design, verification
    results, and contract gaps or assumptions.
