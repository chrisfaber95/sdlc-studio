import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.ts';
import { STACKS } from '../src/db/model.ts';
import { Store } from '../src/db/store.ts';
import { buildApp } from '../src/http/app.ts';
import { parseScaffold } from '../src/pipeline/artifact-schemas.ts';
import { unzip } from '../src/pipeline/zip.ts';
import { STAGE_TIERS } from '../src/router/prompts.ts';
import { StubRouterClient } from '../src/router/stub.ts';
import { RouterError } from '../src/router/types.ts';
import { idea, SCAFFOLD_FILES, validReply } from './fixtures.ts';

const config = loadConfig({ SDLC_OWNER_TOKEN: 'tok' });
const owner = { authorization: 'Bearer tok' };

let store: Store;
let router: StubRouterClient;
let app: FastifyInstance;
beforeEach(() => {
  store = new Store(':memory:');
  router = new StubRouterClient(validReply);
  app = buildApp({ config, store, router });
});
afterEach(() => app.close());

const post = (url: string, payload: object = {}, headers: Record<string, string> = owner) =>
  app.inject({ method: 'POST', url, headers, payload });
const gen = (id: number, kind: string, prompt?: string) =>
  post(`/api/projects/${id}/generate/${kind}`, prompt === undefined ? {} : { prompt });

async function fullProject(stack: string): Promise<number> {
  const id = (await post('/api/projects/from-idea', { stack, idea: idea('Habit Tracker') })).json().project.id;
  for (const kind of ['requirements', 'architecture', 'test_plan', 'scaffold']) {
    expect((await gen(id, kind)).statusCode).toBe(201);
  }
  return id;
}

describe.each(STACKS)('scaffold for %s', (stack) => {
  it('is stored as an artifact, built from the earlier stages, and downloads in one ZIP', async () => {
    const id = await fullProject(stack);
    const last = router.calls.at(-1)!;
    expect(last).toMatchObject({ stage: 'scaffold', tier: STAGE_TIERS.scaffold });
    expect(last.prompt).toMatch(new RegExp(`Stack: ${stack}`));
    expect(last.prompt).toContain('Latest test_plan');
    expect(last.prompt).toContain('Latest architecture');
    expect(last.prompt).toContain('Latest requirements');

    const stored = (await app.inject({ url: `/api/projects/${id}/artifacts?kind=scaffold`, headers: owner })).json();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ version: 1, tier: STAGE_TIERS.scaffold });

    const res = await app.inject({ url: `/api/projects/${id}/download`, headers: owner });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toContain('habit-tracker.zip');
    const files = unzip(res.rawPayload);
    const names = [...files.keys()].map((n) => n.replace('habit-tracker/', ''));
    for (const f of Object.keys(SCAFFOLD_FILES[stack]!)) expect(names).toContain(f);
    expect(names).toEqual(
      expect.arrayContaining([
        'docs/idea.md',
        'docs/requirements.md',
        'docs/architecture.md',
        'docs/diagrams/01-overview.mmd',
        'docs/test-plan.md',
        '.github/workflows/ci.yml',
        'artifacts.json',
      ]),
    );
    expect(files.get('habit-tracker/docs/requirements.md')).toContain('AC-1.1');
    expect(files.get('habit-tracker/docs/diagrams/01-overview.mmd')).toContain('flowchart TD');
    expect(files.get('habit-tracker/docs/test-plan.md')).toContain('TC-1');
    expect(JSON.parse(files.get('habit-tracker/artifacts.json')!).artifacts.scaffold.version).toBe(1);
  });
});

describe('scaffold generation', () => {
  it('needs the test plan first', async () => {
    const id = (await post('/api/projects/from-idea', { stack: 'go', idea: idea('X') })).json().project.id;
    const res = await gen(id, 'scaffold');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('missing_previous_stage');
  });

  it('steers a regeneration into a new version, keeping the old one, and the ZIP has the latest', async () => {
    const id = await fullProject('python');
    expect((await gen(id, 'scaffold', 'use pytest fixtures')).statusCode).toBe(201);
    const all = (await app.inject({ url: `/api/projects/${id}/artifacts?kind=scaffold`, headers: owner })).json();
    expect(all.map((a: { version: number }) => a.version)).toEqual([1, 2]);
    expect(all[1].prompt).toBe('use pytest fixtures');
    const files = unzip((await app.inject({ url: `/api/projects/${id}/download`, headers: owner })).rawPayload);
    expect(files.get('habit-tracker/pyproject.toml')).toContain('use pytest fixtures');
    expect(JSON.parse(files.get('habit-tracker/artifacts.json')!).artifacts.scaffold.version).toBe(2);
  });

  it('stores nothing when the router fails or the output is invalid, and keeps the earlier scaffold', async () => {
    const id = await fullProject('rust');
    router.enqueue(new RouterError('unavailable', 'down'));
    expect((await gen(id, 'scaffold')).statusCode).toBe(502);
    router.enqueue({ content: JSON.stringify({ summary: 's', files: [{ path: 'README.md', content: 'x' }] }) });
    const bad = await gen(id, 'scaffold');
    expect(bad.statusCode).toBe(502);
    expect(bad.json().error).toBe('invalid_output');
    const all = (await app.inject({ url: `/api/projects/${id}/artifacts?kind=scaffold`, headers: owner })).json();
    expect(all).toHaveLength(1);
  });

  it('rejects unsafe or reserved paths and a missing manifest or test', () => {
    const ok = SCAFFOLD_FILES.go!;
    const mk = (extra: Record<string, string>, base = ok) => ({
      summary: 's',
      files: Object.entries({ ...base, ...extra }).map(([path, content]) => ({ path, content })),
    });
    expect(() => parseScaffold(mk({}), 'go')).not.toThrow();
    for (const p of ['../evil', '/etc/passwd', 'a\\b', 'docs/x.md', '.github/workflows/x.yml', 'a//b']) {
      expect(() => parseScaffold(mk({ [p]: 'x' }), 'go'), p).toThrow();
    }
    expect(() => parseScaffold(mk({}, { 'main.go': 'x', 'main_test.go': 'x', 'README.md': 'x' }), 'go')).toThrow(/go\.mod/);
    expect(() => parseScaffold(mk({}, { 'go.mod': 'x', 'main.go': 'x', 'README.md': 'x' }), 'go')).toThrow(/test/);
  });
});

describe('download', () => {
  it('contains only what exists so far, and is 404 for unknown projects', async () => {
    const id = (await post('/api/projects/from-idea', { stack: 'go', idea: idea('Early') })).json().project.id;
    const files = unzip((await app.inject({ url: `/api/projects/${id}/download`, headers: owner })).rawPayload);
    expect([...files.keys()].sort()).toEqual(['early/artifacts.json', 'early/docs/idea.md']);
    expect((await app.inject({ url: '/api/projects/999/download', headers: owner })).statusCode).toBe(404);
  });

  it('lets visitors download example projects only', async () => {
    const id = await fullProject('typescript');
    const anon = (url: string) => app.inject({ url });
    expect((await anon(`/api/projects/${id}/download`)).statusCode).toBe(404);
    await app.inject({ method: 'PATCH', url: `/api/projects/${id}`, headers: owner, payload: { isExample: true } });
    const res = await anon(`/api/projects/${id}/download`);
    expect(res.statusCode).toBe(200);
    expect(unzip(res.rawPayload).size).toBeGreaterThan(8);
    expect((await app.inject({ method: 'POST', url: `/api/projects/${id}/generate/scaffold` })).statusCode).toBe(403);
  });
});
