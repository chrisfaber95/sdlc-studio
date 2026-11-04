---
name: write-openapi
description: "Procedure for writing or updating an OpenAPI specification: paths, reusable schemas, examples, error responses, security schemes and validation, matching the project's existing spec version and style. Followed by the api-designer agent; in a main session, delegate OpenAPI work to that agent."
argument-hint: "<endpoints to specify or spec file to update>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

Write or update the OpenAPI spec for: $ARGUMENTS

Wherever a step says to ask the user: in a main session, ask. When running as the api-designer
subagent, state the assumption and return the question.

## Steps

1. Find the existing spec (`openapi.yaml`, `openapi.json`, `swagger.*`, a `docs/` or `api/`
   folder) and match its version (3.0 or 3.1), format (YAML or JSON), tag and naming style. If
   there is no spec, create `openapi.yaml` at the place the project keeps docs, using OpenAPI
   3.1 unless a tool in the project requires 3.0.
2. Derive the spec from the real routes and handlers when documenting existing endpoints, and
   from the design when specifying new ones. Never document behavior you did not see. Mark
   anything you inferred in the description.
3. Structure: `info` (title, version), `servers` (placeholders only), `tags`, `paths`, and
   `components` for everything reused: `schemas`, `parameters` (pagination, ids),
   `responses` (the shared error responses), `securitySchemes`.
4. Each operation has a stable `operationId`, a short `summary`, the parameters with types and
   constraints, a `requestBody` where needed, and every response it can return, including the
   shared error responses (400, 401, 403, 404, 409, 422, 429 as applicable).
5. Schemas: precise types, `required` lists, formats (`date-time`, `uuid`, `email`), `enum`
   values, `minimum`/`maxLength` constraints that match server validation, `nullable` handled
   the way the chosen version expects, and `additionalProperties` set deliberately. Reuse with
   `$ref`; do not copy a schema twice.
6. Add one realistic `example` per request and response using placeholder data. Never put real
   tokens, keys or personal data in a spec.
7. Security: declare the scheme (for example HTTP bearer) under `securitySchemes`, apply it
   globally with `security`, and override to `[]` on public endpoints.
8. Validate. Use the validator already in the repo (for example Redocly, Spectral, Swagger CLI,
   or a script in `package.json`). If none exists, `npx @redocly/cli lint <file>` runs once
   without installing anything into the project; use it, or review by hand and say the spec is
   unverified. Fix every error; explain any warning you keep.
9. If the spec is used for code or client generation, check that your changes do not break that
   step, and say if you could not run it.
10. Report: the file changed, the operations added or changed, how it was validated, and the
    assumptions or places where the spec and the implementation disagree.
