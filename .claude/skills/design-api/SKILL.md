---
name: design-api
description: "Procedure for designing HTTP API endpoints: resource model, methods and status codes, request and response shapes, a single error format, pagination, filtering, idempotency, authentication, versioning and rate limiting, consistent with the existing API. Followed by the api-designer agent; in a main session, delegate API design to that agent."
argument-hint: "<feature or endpoint to design>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

Design the API for: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the api-designer
subagent, state the assumption and return the question. Design only; do not implement handlers
unless the request says to.

## Steps

1. Understand the use case: who calls this (browser client, mobile app, another service), what
   they need to do, and which existing endpoints and data it relates to. Reuse existing
   resources and conventions before adding new ones.
2. Model resources as nouns with plural collections (`/orders`, `/orders/{id}`). Nest only to
   express ownership and no deeper than two levels. Model actions that are not CRUD as a
   sub-resource or a clearly named action (`POST /orders/{id}/cancel`) rather than a verb in a
   collection.
3. Choose methods by meaning: `GET` reads (safe, cacheable), `POST` creates or triggers,
   `PUT` replaces (idempotent), `PATCH` changes part of a resource, `DELETE` removes (idempotent).
4. Choose status codes: `200` OK, `201` created with a `Location` header, `204` no content,
   `400` malformed request, `401` not authenticated, `403` not allowed, `404` not found,
   `409` conflict, `422` valid shape but fails business rules, `429` rate limited, `5xx` server
   fault. Do not return `200` with an error body.
5. Define request and response shapes: field names in the project's casing, ISO 8601 UTC
   timestamps, money as a string amount with a currency or as integer minor units (follow the
   project and say which), stable string or numeric ids, no internal fields (database ids that
   should stay private, password hashes). Prefer returning the resource after create and update.
6. One error format everywhere. If the project has one, use it. Otherwise use problem details
   (RFC 9457, `application/problem+json`) or a small `{ code, message, details }` object: a
   machine-readable code, a human message, and per-field errors for validation. Never include
   stack traces or internals.
7. Collections: pagination (cursor for large or changing sets, offset only for small stable
   ones), a maximum page size and default, whitelisted filters and sort fields, and the total
   count only if it is cheap. State how the database will serve the filters.
8. Retries and concurrency: make unsafe operations that clients may retry (creating orders,
   payments) idempotent with an `Idempotency-Key` header. Use `ETag`/`If-Match` or a version
   field where lost updates matter.
9. Security: how it is authenticated, which role or scope may call it, and object-level checks
   (a user may only read their own orders). Rate limit sensitive and expensive endpoints. Never
   accept prices or totals from the client for server-side calculation.
10. Versioning and compatibility: additive changes (new optional fields, new endpoints) are
    non-breaking. Removing or renaming fields, changing types, or making optional input required
    is breaking and needs a new version or a deprecation period. Follow the project's
    versioning scheme (path prefix such as `/v1`, or a header).
11. Write the design: a table of endpoints (method, path, purpose, auth), example request and
    response bodies with placeholder data, the error cases, and the open questions. Put it where
    the project keeps API docs, and use the `write-openapi` skill if the project has an
    OpenAPI file.
