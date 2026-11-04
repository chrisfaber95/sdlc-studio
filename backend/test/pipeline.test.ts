import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.ts';
import { Store } from '../src/db/store.ts';
import { buildApp } from '../src/http/app.ts';
import { parseArchitecture, parseIdeas, parseRequirements, parseTestPlan } from '../src/pipeline/artifact-schemas.ts';
import { STAGE_TIERS } from '../src/router/prompts.ts';
import { StubRouterClient } from '../src/router/stub.ts';
import { RouterError } from '../src/router/types.ts';
import { idea, validReply } from './fixtures.ts';

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

async function newProject(): Promise<number> {
  const res = await post('/api/projects/from-idea', { stack: 'go', idea: idea('Habits') });
  return res.json().project.id;
}
const gen = (id: number, kind: string, prompt?: string) =>
  post(`/api/projects/${id}/generate/${kind}`, prompt === undefined ? {} : { prompt });

describe('ideas', () => {
  it('returns at least 3 complete ideas and the tier, and sends stack, topic and effort to the router', async () => {
    const res = await post('/api/ideas', { stack: 'rust', topic: 'home automation', effort: 'medium' });
    expect(res.statusCode).toBe(200);
    const { ideas, tier } = res.json();
    expect(ideas.length).toBeGreaterThanOrEqual(3);
    expect(ideas[0]).toMatchObject({ title: expect.any(String), summary: expect.any(String), effort: 'small', noveltyScore: 6 });
    expect(ideas[0].skillTags.length).toBeGreaterThan(0);
    expect(tier).toBe(STAGE_TIERS.idea);
    expect(router.calls[0]).toMatchObject({ stage: 'idea', tier: STAGE_TIERS.idea });
    expect(router.calls[0]?.prompt).toMatch(/Stack: rust[\s\S]*Topic: home automation[\s\S]*Effort: medium/);
  });

  it.each([
    [{ stack: 'cobol', topic: 't', effort: 'small' }],
    [{ stack: 'go', topic: '', effort: 'small' }],
    [{ stack: 'go', topic: 't', effort: 'huge' }],
  ])('rejects bad input %j without calling the router', async (body) => {
    expect((await post('/api/ideas', body)).statusCode).toBe(400);
    expect(router.calls).toHaveLength(0);
  });

  it('fails when the router returns fewer than 3 ideas', async () => {
    router.enqueue({ content: JSON.stringify({ ideas: [idea('a'), idea('b')] }) });
    const res = await post('/api/ideas', { stack: 'go', topic: 't', effort: 'small' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('invalid_output');
  });

  it('is owner only', async () => {
    expect((await post('/api/ideas', { stack: 'go', topic: 't', effort: 'small' }, {})).statusCode).toBe(403);
    expect(router.calls).toHaveLength(0);
  });
});

describe('choosing an idea', () => {
  it('creates a project in stage ideate with the idea as version 1 and its tier', async () => {
    const res = await post('/api/projects/from-idea', { stack: 'vue', idea: idea('Habits'), tier: 'local' });
    expect(res.statusCode).toBe(201);
    const { project, artifact } = res.json();
    expect(project).toMatchObject({ title: 'Habits', stack: 'vue', stage: 'ideate' });
    expect(artifact).toMatchObject({ kind: 'idea', version: 1, tier: 'local' });
    expect(store.listProjects()).toHaveLength(1);
  });

  it('refuses an invalid idea and creates nothing', async () => {
    const res = await post('/api/projects/from-idea', { stack: 'vue', idea: { title: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(store.listProjects()).toHaveLength(0);
  });
});

describe('ordering', () => {
  it('refuses a stage whose previous artifact is missing, without calling the router', async () => {
    const id = await newProject();
    for (const kind of ['architecture', 'test_plan']) {
      const res = await gen(id, kind);
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('missing_previous_stage');
    }
    expect(router.calls).toHaveLength(0);
    await gen(id, 'requirements');
    expect((await gen(id, 'test_plan')).statusCode).toBe(409);
    expect(store.listArtifacts(id).map((a) => a.kind)).toEqual(['idea', 'requirements']);
  });

  it('builds each stage from the latest previous artifact', async () => {
    const id = await newProject();
    await gen(id, 'requirements');
    await gen(id, 'requirements', 'newer');
    await gen(id, 'architecture');
    const archCall = router.calls.at(-1)!;
    expect(archCall.prompt).toContain('track habits [newer]');
    expect(archCall.stage).toBe('architecture');
    await gen(id, 'test_plan');
    expect(router.calls.at(-1)?.prompt).toContain('Small API');
    expect(router.calls.map((c) => c.stage)).toEqual(['requirements', 'requirements', 'architecture', 'test_plan']);
  });

  it('refuses an unknown kind and a scaffold before the test plan exists', async () => {
    const id = await newProject();
    expect((await gen(id, 'scaffold')).statusCode).toBe(409);
    expect((await gen(id, 'nonsense')).statusCode).toBe(400);
  });

  it('refuses unknown projects', async () => {
    expect((await gen(999, 'requirements')).statusCode).toBe(404);
  });
});

describe('stored artifacts', () => {
  it('stores a valid artifact per stage with the router tier', async () => {
    const id = await newProject();
    for (const kind of ['requirements', 'architecture', 'test_plan'] as const) {
      const res = await gen(id, kind);
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ kind, version: 1, tier: STAGE_TIERS[kind] });
    }
    const [req, arch, plan] = ['requirements', 'architecture', 'test_plan'].map((k) =>
      JSON.parse(store.latestArtifact(id, k as 'requirements')!.content),
    );
    expect(parseRequirements(req).userStories[0]?.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(parseArchitecture(arch).diagrams[0]?.mermaid).toMatch(/^flowchart/);
    expect(parseTestPlan(plan).ciWorkflow.path).toBe('.github/workflows/ci.yml');
  });

  it('records the tier the router reports, not the one requested', async () => {
    const id = await newProject();
    router.enqueue({ ...validReply({ stage: 'requirements', prompt: '' } as never), tier: 'claude' });
    expect((await gen(id, 'requirements')).json().tier).toBe('claude');
  });

  it('keeps router citations and drops ones the model invented', async () => {
    const id = await newProject();
    const body = JSON.parse(validReply({ stage: 'requirements', prompt: '' } as never).content);
    router.enqueue({ content: JSON.stringify({ ...body, citations: [{ title: 'fake', url: 'http://fake' }] }) });
    expect(JSON.parse((await gen(id, 'requirements')).json().content).citations).toBeUndefined();
    router.enqueue({ ...validReply({ stage: 'requirements', prompt: '' } as never), citations: [{ title: 'Doc', url: 'http://doc' }] });
    expect(JSON.parse((await gen(id, 'requirements')).json().content).citations).toEqual([{ title: 'Doc', url: 'http://doc' }]);
  });

  it('accepts output wrapped in a code fence', async () => {
    const id = await newProject();
    const { content } = validReply({ stage: 'requirements', prompt: '' } as never);
    router.enqueue({ content: '```json\n' + content + '\n```' });
    expect((await gen(id, 'requirements')).statusCode).toBe(201);
  });
});

describe('schema validation', () => {
  const reqOk = JSON.parse(validReply({ stage: 'requirements', prompt: '' } as never).content);
  const archOk = JSON.parse(validReply({ stage: 'architecture', prompt: '' } as never).content);
  const planOk = JSON.parse(validReply({ stage: 'test_plan', prompt: '' } as never).content);
  const clone = <T>(v: T): T => structuredClone(v);

  it('requires a testable acceptance criterion on every story', () => {
    const bad = clone(reqOk);
    bad.userStories[0].acceptanceCriteria = [];
    expect(() => parseRequirements(bad)).toThrow(/acceptanceCriteria.*at least 1/);
  });
  it('rejects duplicate acceptance criterion ids', () => {
    const bad = clone(reqOk);
    bad.userStories[0].acceptanceCriteria[1].id = 'AC-1.1';
    expect(() => parseRequirements(bad)).toThrow(/duplicate/);
  });
  it.each(['components', 'dataModel', 'decisions', 'diagrams'])('requires architecture.%s', (field) => {
    const bad = clone(archOk);
    bad[field] = [];
    expect(() => parseArchitecture(bad)).toThrow(/at least 1/);
  });
  it('rejects a diagram that is not Mermaid', () => {
    const bad = clone(archOk);
    bad.diagrams[0].mermaid = 'just words';
    expect(() => parseArchitecture(bad)).toThrow(/Mermaid/);
  });
  it('requires a CI workflow file in the test plan', () => {
    const noCi = clone(planOk);
    delete noCi.ciWorkflow;
    expect(() => parseTestPlan(noCi)).toThrow(/ciWorkflow/);
    const badPath = clone(planOk);
    badPath.ciWorkflow.path = 'ci.yml';
    expect(() => parseTestPlan(badPath)).toThrow(/\.github\/workflows/);
  });
  it('requires test cases to link acceptance criteria', () => {
    const bad = clone(planOk);
    bad.testCases[0].acceptanceCriteria = [];
    expect(() => parseTestPlan(bad)).toThrow(/at least 1/);
  });
  it('rejects ideas with a novelty score out of range', () => {
    expect(() => parseIdeas({ ideas: [idea('a'), idea('b'), { ...idea('c'), noveltyScore: 11 }] })).toThrow(/noveltyScore/);
  });

  it('refuses a test plan that links an unknown acceptance criterion, and stores nothing', async () => {
    const id = await newProject();
    await gen(id, 'requirements');
    await gen(id, 'architecture');
    const bad = clone(planOk);
    bad.testCases[0].acceptanceCriteria = ['AC-9.9'];
    router.enqueue({ content: JSON.stringify(bad) });
    const res = await gen(id, 'test_plan');
    expect(res.statusCode).toBe(502);
    expect(res.json().message).toContain('AC-9.9');
    expect(store.listArtifacts(id, 'test_plan')).toHaveLength(0);
  });

  it('treats non-JSON router output as a failed generation', async () => {
    const id = await newProject();
    router.enqueue({ content: 'Sure! Here are your requirements' });
    const res = await gen(id, 'requirements');
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('invalid_output');
    expect(store.listArtifacts(id, 'requirements')).toHaveLength(0);
  });
});

describe('versions and steering', () => {
  it('regenerating adds a version; every version stays listable and retrievable', async () => {
    const id = await newProject();
    await gen(id, 'requirements');
    await gen(id, 'requirements', 'focus on offline use');
    const list = (await app.inject({ url: `/api/projects/${id}/artifacts?kind=requirements`, headers: owner })).json();
    expect(list.map((a: { version: number }) => a.version)).toEqual([1, 2]);
    const v1 = (await app.inject({ url: `/api/projects/${id}/artifacts/requirements/1`, headers: owner })).json();
    expect(v1).toMatchObject({ version: 1, prompt: null });
    expect(v1.content).not.toContain('offline');
    const v2 = (await app.inject({ url: `/api/projects/${id}/artifacts/requirements/2`, headers: owner })).json();
    expect(v2).toMatchObject({ version: 2, prompt: 'focus on offline use' });
    expect(v2.content).toContain('offline');
    expect((await app.inject({ url: `/api/projects/${id}/artifacts/requirements/3`, headers: owner })).statusCode).toBe(404);
  });

  it.each(['requirements', 'architecture', 'test_plan'] as const)('passes the extra prompt for %s to the router, last, and it changes the result', async (kind) => {
    const id = await newProject();
    await gen(id, 'requirements');
    if (kind !== 'requirements') await gen(id, 'architecture');
    const before = router.calls.length;
    const first = await gen(id, kind);
    const steered = await gen(id, kind, 'use more diagrams');
    expect(router.calls).toHaveLength(before + 2);
    const prompt = router.calls.at(-1)!.prompt;
    expect(prompt.endsWith('use more diagrams')).toBe(true);
    expect(router.calls.at(-2)!.prompt).not.toContain('use more diagrams');
    expect(steered.json().content).not.toBe(first.json().content);
  });

  it('rejects an extra prompt that is not a short string', async () => {
    const id = await newProject();
    expect((await post(`/api/projects/${id}/generate/requirements`, { prompt: 42 })).statusCode).toBe(400);
    expect(router.calls).toHaveLength(0);
  });

  it('steers ideas too', async () => {
    const res = await post('/api/ideas', { stack: 'go', topic: 't', effort: 'small', prompt: 'no web apps' });
    expect(res.json().ideas[0].title).toContain('no web apps');
  });
});

describe('failure handling', () => {
  it.each([
    [new RouterError('unavailable', 'Router is unreachable'), 502, 'router_unavailable'],
    [new RouterError('timeout', 'Router timed out'), 504, 'router_timeout'],
    [new RouterError('unauthorized', 'Router refused the token'), 502, 'router_unauthorized'],
    [new Error('boom'), 502, 'router_failed'],
  ])('answers a clear error for %s and leaves earlier artifacts untouched', async (err, status, code) => {
    const id = await newProject();
    await gen(id, 'requirements');
    await gen(id, 'architecture');
    const before = store.listArtifacts(id);
    router.enqueue(err);
    const res = await gen(id, 'architecture', 'try again');
    expect(res.statusCode).toBe(status);
    expect(res.json()).toMatchObject({ error: code, message: expect.stringContaining('nothing was stored') });
    expect(store.listArtifacts(id)).toEqual(before);
    // the pipeline recovers once the router is back
    expect((await gen(id, 'architecture')).json().version).toBe(2);
  });

  it('answers a clear error when idea generation fails', async () => {
    router.enqueue(new RouterError('unavailable', 'Router is unreachable'));
    const res = await post('/api/ideas', { stack: 'go', topic: 't', effort: 'small' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('router_unavailable');
  });
});

describe('projects and stages', () => {
  it('lists projects with their stage and moves one, owner only', async () => {
    const a = await newProject();
    const b = await newProject();
    const moved = await app.inject({ method: 'PATCH', url: `/api/projects/${a}`, headers: owner, payload: { stage: 'build' } });
    expect(moved.json()).toMatchObject({ id: a, stage: 'build' });
    const list = (await app.inject({ url: '/api/projects', headers: owner })).json();
    expect(list.map((p: { id: number; stage: string }) => [p.id, p.stage])).toEqual([[a, 'build'], [b, 'ideate']]);
    const refused = await app.inject({ method: 'PATCH', url: `/api/projects/${b}`, payload: { stage: 'retro' } });
    expect(refused.statusCode).toBe(403);
    expect(store.getProject(b)?.stage).toBe('ideate');
    expect((await app.inject({ method: 'PATCH', url: `/api/projects/${b}`, headers: owner, payload: { stage: 'done' } })).statusCode).toBe(400);
  });

  it('keeps the stage after a restart (same database file, new app)', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sdlc-')), 'db.sqlite');
    const first = new Store(path);
    const a = buildApp({ config, store: first, router });
    const created = await a.inject({ method: 'POST', url: '/api/projects/from-idea', headers: owner, payload: { stack: 'go', idea: idea('Persist') } });
    const id = created.json().project.id;
    await a.inject({ method: 'PATCH', url: `/api/projects/${id}`, headers: owner, payload: { stage: 'design' } });
    await a.close();
    first.close();
    const second = new Store(path);
    const b = buildApp({ config, store: second, router });
    expect((await b.inject({ url: '/api/projects', headers: owner })).json()).toMatchObject([{ id, stage: 'design' }]);
    await b.close();
    second.close();
  });

  it('refuses a visitor on every pipeline endpoint', async () => {
    const id = await newProject();
    for (const url of ['/api/ideas', '/api/projects/from-idea', `/api/projects/${id}/generate/requirements`]) {
      expect((await post(url, {}, {})).statusCode).toBe(403);
    }
    expect(router.calls).toHaveLength(0);
  });
});
