import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from './schema.ts';
import type { Artifact, ArtifactKind, Project, Stack, Stage, Tier } from './model.ts';

type Row = Record<string, unknown>;

const toProject = (r: Row): Project => ({
  id: r.id as number,
  title: r.title as string,
  stack: r.stack as Stack,
  stage: r.stage as Stage,
  isExample: r.is_example === 1,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const toArtifact = (r: Row): Artifact => ({
  id: r.id as number,
  projectId: r.project_id as number,
  kind: r.kind as ArtifactKind,
  version: r.version as number,
  content: r.content as string,
  prompt: (r.prompt as string | null) ?? null,
  tier: r.tier as Tier,
  createdAt: r.created_at as string,
});

export interface NewProject {
  title: string;
  stack: Stack;
  stage?: Stage;
  isExample?: boolean;
}

export interface NewArtifact {
  projectId: number;
  kind: ArtifactKind;
  content: string;
  prompt?: string | null;
  tier: Tier;
}

export class Store {
  readonly #db: DatabaseSync;
  readonly #now: () => Date;

  constructor(path: string, now: () => Date = () => new Date()) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.#db.exec(SCHEMA);
    this.#now = now;
  }

  close(): void {
    this.#db.close();
  }

  createProject(input: NewProject): Project {
    const ts = this.#now().toISOString();
    const res = this.#db
      .prepare(
        'INSERT INTO projects (title, stack, stage, is_example, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(input.title, input.stack, input.stage ?? 'ideate', input.isExample ? 1 : 0, ts, ts);
    return this.getProject(Number(res.lastInsertRowid))!;
  }

  getProject(id: number): Project | undefined {
    const r = this.#db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return r ? toProject(r) : undefined;
  }

  listProjects(opts: { examplesOnly?: boolean } = {}): Project[] {
    const sql = `SELECT * FROM projects ${opts.examplesOnly ? 'WHERE is_example = 1' : ''} ORDER BY id`;
    return this.#db.prepare(sql).all().map(toProject);
  }

  updateProject(id: number, patch: { title?: string; stage?: Stage; isExample?: boolean }): Project | undefined {
    const cur = this.getProject(id);
    if (!cur) return undefined;
    this.#db
      .prepare('UPDATE projects SET title = ?, stage = ?, is_example = ?, updated_at = ? WHERE id = ?')
      .run(
        patch.title ?? cur.title,
        patch.stage ?? cur.stage,
        (patch.isExample ?? cur.isExample) ? 1 : 0,
        this.#now().toISOString(),
        id,
      );
    return this.getProject(id);
  }

  /** Appends a new version of an artifact. Earlier versions are never touched. */
  addArtifact(input: NewArtifact): Artifact {
    const db = this.#db;
    db.exec('BEGIN IMMEDIATE');
    try {
      const max = db
        .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM artifacts WHERE project_id = ? AND kind = ?')
        .get(input.projectId, input.kind);
      const version = (max!.v as number) + 1;
      const res = db
        .prepare(
          'INSERT INTO artifacts (project_id, kind, version, content, prompt, tier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          input.projectId,
          input.kind,
          version,
          input.content,
          input.prompt ?? null,
          input.tier,
          this.#now().toISOString(),
        );
      db.exec('COMMIT');
      return toArtifact(db.prepare('SELECT * FROM artifacts WHERE id = ?').get(Number(res.lastInsertRowid))!);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  /** All versions, oldest first. */
  listArtifacts(projectId: number, kind?: ArtifactKind): Artifact[] {
    const rows = kind
      ? this.#db
          .prepare('SELECT * FROM artifacts WHERE project_id = ? AND kind = ? ORDER BY kind, version')
          .all(projectId, kind)
      : this.#db.prepare('SELECT * FROM artifacts WHERE project_id = ? ORDER BY kind, version').all(projectId);
    return rows.map(toArtifact);
  }

  latestArtifact(projectId: number, kind: ArtifactKind): Artifact | undefined {
    const r = this.#db
      .prepare('SELECT * FROM artifacts WHERE project_id = ? AND kind = ? ORDER BY version DESC LIMIT 1')
      .get(projectId, kind);
    return r ? toArtifact(r) : undefined;
  }
}
