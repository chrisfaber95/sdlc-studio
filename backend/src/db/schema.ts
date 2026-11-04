import { ARTIFACT_KINDS, STACKS, STAGES, TIERS } from './model.ts';

const q = (list: readonly string[]) => list.map((s) => `'${s}'`).join(', ');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  stack       TEXT NOT NULL CHECK (stack IN (${q(STACKS)})),
  stage       TEXT NOT NULL DEFAULT 'ideate' CHECK (stage IN (${q(STAGES)})),
  is_example  INTEGER NOT NULL DEFAULT 0 CHECK (is_example IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id),
  kind        TEXT NOT NULL CHECK (kind IN (${q(ARTIFACT_KINDS)})),
  version     INTEGER NOT NULL CHECK (version >= 1),
  content     TEXT NOT NULL,
  prompt      TEXT,
  tier        TEXT NOT NULL CHECK (tier IN (${q(TIERS)})),
  created_at  TEXT NOT NULL,
  UNIQUE (project_id, kind, version)
);

-- Artifacts are append-only: a regeneration is a new version, never an overwrite.
CREATE TRIGGER IF NOT EXISTS artifacts_no_update BEFORE UPDATE ON artifacts
BEGIN SELECT RAISE(ABORT, 'artifacts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS artifacts_no_delete BEFORE DELETE ON artifacts
BEGIN SELECT RAISE(ABORT, 'artifacts are immutable'); END;
`;
