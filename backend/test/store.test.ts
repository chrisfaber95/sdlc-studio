import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/db/store.ts';

let store: Store;
beforeEach(() => {
  store = new Store(':memory:');
});

describe('projects', () => {
  it('creates a project in stage ideate, not an example by default', () => {
    const p = store.createProject({ title: 'Habit tracker', stack: 'go' });
    expect(p).toMatchObject({ title: 'Habit tracker', stack: 'go', stage: 'ideate', isExample: false });
  });

  it('persists a stage move', () => {
    const p = store.createProject({ title: 'A', stack: 'rust' });
    store.updateProject(p.id, { stage: 'design' });
    expect(store.getProject(p.id)?.stage).toBe('design');
  });

  it('rejects an unknown stack or stage at the database level', () => {
    expect(() => store.createProject({ title: 'A', stack: 'cobol' as never })).toThrow();
    const p = store.createProject({ title: 'A', stack: 'vue' });
    expect(() => store.updateProject(p.id, { stage: 'nope' as never })).toThrow();
  });

  it('lists only examples when asked', () => {
    store.createProject({ title: 'private', stack: 'go' });
    store.createProject({ title: 'demo', stack: 'go', isExample: true });
    expect(store.listProjects({ examplesOnly: true }).map((p) => p.title)).toEqual(['demo']);
    expect(store.listProjects()).toHaveLength(2);
  });

  it('returns undefined when updating a missing project', () => {
    expect(store.updateProject(99, { stage: 'spec' })).toBeUndefined();
  });
});

describe('artifacts', () => {
  const add = (projectId: number, content: string, prompt?: string) =>
    store.addArtifact({ projectId, kind: 'requirements', content, prompt: prompt ?? null, tier: 'local' });

  it('adds versions instead of overwriting, per kind', () => {
    const p = store.createProject({ title: 'A', stack: 'python' });
    expect(add(p.id, 'v1').version).toBe(1);
    expect(add(p.id, 'v2', 'more detail').version).toBe(2);
    expect(store.addArtifact({ projectId: p.id, kind: 'idea', content: 'i', tier: 'claude' }).version).toBe(1);
    expect(store.listArtifacts(p.id, 'requirements').map((a) => a.content)).toEqual(['v1', 'v2']);
    expect(store.latestArtifact(p.id, 'requirements')).toMatchObject({ version: 2, prompt: 'more detail' });
  });

  it('records the tier that made each version', () => {
    const p = store.createProject({ title: 'A', stack: 'python' });
    store.addArtifact({ projectId: p.id, kind: 'architecture', content: 'x', tier: 'claude' });
    expect(store.latestArtifact(p.id, 'architecture')?.tier).toBe('claude');
    expect(() => store.addArtifact({ projectId: p.id, kind: 'architecture', content: 'x', tier: 'gpt' as never })).toThrow();
  });

  it('refuses to update or delete a stored artifact, even with raw SQL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-'));
    const path = join(dir, 'a.db');
    const file = new Store(path);
    const p = file.createProject({ title: 'A', stack: 'python' });
    file.addArtifact({ projectId: p.id, kind: 'idea', content: 'v1', tier: 'local' });
    const raw = new DatabaseSync(path);
    expect(() => raw.exec("UPDATE artifacts SET content = 'changed'")).toThrow(/immutable/);
    expect(() => raw.exec('DELETE FROM artifacts')).toThrow(/immutable/);
    raw.close();
    expect(file.latestArtifact(p.id, 'idea')?.content).toBe('v1');
    file.close();
    rmSync(dir, { recursive: true });
  });

  it('keeps earlier versions when an insert fails', () => {
    const p = store.createProject({ title: 'A', stack: 'python' });
    add(p.id, 'v1');
    expect(() => store.addArtifact({ projectId: 999, kind: 'idea', content: 'x', tier: 'local' })).toThrow();
    expect(store.listArtifacts(p.id)).toHaveLength(1);
  });

  it('returns undefined for a kind with no artifact yet', () => {
    const p = store.createProject({ title: 'A', stack: 'python' });
    expect(store.latestArtifact(p.id, 'scaffold')).toBeUndefined();
  });
});
