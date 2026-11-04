---
name: review-api-change
description: "Procedure for reviewing a diff or proposal for API compatibility: find breaking changes to paths, fields, types, status codes, auth, pagination and semantics, and say whether a new version or migration path is needed. Followed by the api-designer agent; in a main session, delegate API compatibility reviews to that agent."
argument-hint: "<diff, branch, or spec change to review>"
allowed-tools: [Read, Glob, Grep, Bash]
---

Review API compatibility of: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the api-designer
subagent, state the assumption and return the question. Read-only: report; do not edit.

## Steps

1. Get the change: `git diff <base>...HEAD`, `git diff`, or the spec files named in the request.
   Identify the contract surface it touches: route definitions, handlers, validation schemas,
   response builders, the OpenAPI or GraphQL schema, and shared types.
2. Compare old and new behavior, not only the spec. A handler that now returns a different
   shape is a contract change even if the spec was not edited. If both an old and a new spec
   exist, compare them; if `oasdiff` is already available in the repo or on the machine, use
   it as a second opinion.
3. Classify each change.
   Breaking (existing clients can fail):
   - a path, method or operation removed or renamed
   - a response field removed, renamed, moved, or its type, format or nullability changed
   - a new required request field, parameter or header; a narrower accepted range or enum
   - an enum value removed from a response clients switch on, or a new value in a response where
     clients do not expect unknown values
   - changed status codes, error shapes or error codes clients handle
   - changed semantics with the same shape (units, sort order, default page size, rounding,
     timestamps' time zone, idempotency)
   - stricter authentication or authorization, rate limits, or size limits
   Non-breaking: new optional fields, new endpoints, new optional parameters, a wider accepted
   input, and new enum values in requests.
4. Find who is affected: search the repo for callers (the client app, other services, tests,
   docs). Report the affected files, and say clearly when callers outside the repo cannot be
   checked.
5. For each breaking change, recommend one of: avoid it by making it additive, keep the old
   field and deprecate it, introduce a new version, or coordinate a simultaneous client change
   (acceptable only when you control every client). Say what the deprecation or migration path
   looks like.
6. Report: a verdict (compatible, compatible with notes, breaking), a table of each change with
   its classification and evidence (file and line), affected callers, the recommendation, and
   what you could not verify.
