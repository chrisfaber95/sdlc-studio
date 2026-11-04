import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.ts';
import { Store } from '../src/db/store.ts';
import { GithubPublisher, PublishError } from '../src/github/publisher.ts';
import type { PublishRequest, Publisher } from '../src/github/publisher.ts';
import { buildApp } from '../src/http/app.ts';
import { StubRouterClient } from '../src/router/stub.ts';
import { idea, validReply } from './fixtures.ts';

const owner = { authorization: 'Bearer tok' };
const config = loadConfig({ SDLC_OWNER_TOKEN: 'tok' });

class StubPublisher implements Publisher {
  calls: PublishRequest[] = [];
  error: PublishError | undefined;
  async publish(req: PublishRequest) {
    this.calls.push(req);
    if (this.error) throw this.error;
    return { url: `https://github.com/me/${req.name}`, fullName: `me/${req.name}` };
  }
}

let store: Store;
let publisher: StubPublisher;
let app: FastifyInstance;
beforeEach(() => {
  store = new Store(':memory:');
  publisher = new StubPublisher();
  app = buildApp({ config, store, router: new StubRouterClient(validReply), publisher });
});
afterEach(() => app.close());

const post = (url: string, payload: object = {}, headers: Record<string, string> = owner) =>
  app.inject({ method: 'POST', url, headers, payload });

async function project(): Promise<number> {
  const id = (await post('/api/projects/from-idea', { stack: 'typescript', idea: idea('Habit Tracker') })).json().project.id;
  for (const kind of ['requirements', 'architecture', 'test_plan', 'scaffold']) await post(`/api/projects/${id}/generate/${kind}`);
  return id;
}

describe('POST /api/projects/:id/publish', () => {
  it('publishes the same files as the ZIP and remembers the repository', async () => {
    const id = await project();
    const res = await post(`/api/projects/${id}/publish`);
    expect(res.statusCode).toBe(201);
    expect(res.json().repoUrl).toBe('https://github.com/me/habit-tracker');
    const paths = publisher.calls[0]!.files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['docs/requirements.md', 'docs/architecture.md', 'artifacts.json', 'package.json']));
    expect(paths.every((p) => !p.startsWith('habit-tracker/'))).toBe(true);
    expect((await app.inject({ url: `/api/projects/${id}`, headers: owner })).json().repoUrl).toBe('https://github.com/me/habit-tracker');
  });

  it('uses a given repository name and refuses a bad one', async () => {
    const id = await project();
    expect((await post(`/api/projects/${id}/publish`, { name: 'bad name/..' })).statusCode).toBe(400);
    expect((await post(`/api/projects/${id}/publish`, { name: '..' })).statusCode).toBe(400);
    expect((await post(`/api/projects/${id}/publish`, { name: 'my-repo' })).json().repoUrl).toMatch(/my-repo$/);
  });

  it('publishes only once', async () => {
    const id = await project();
    await post(`/api/projects/${id}/publish`);
    const again = await post(`/api/projects/${id}/publish`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('already_published');
    expect(publisher.calls).toHaveLength(1);
  });

  it('refuses a project without artifacts', async () => {
    const p = store.createProject({ title: 'Empty', stack: 'go' });
    expect((await post(`/api/projects/${p.id}/publish`)).statusCode).toBe(400);
  });

  it('is owner only', async () => {
    const id = await project();
    expect((await post(`/api/projects/${id}/publish`, {}, {})).statusCode).toBe(403);
  });

  it('maps GitHub failures and stores nothing', async () => {
    const id = await project();
    publisher.error = new PublishError('name_taken', 'exists');
    expect((await post(`/api/projects/${id}/publish`)).statusCode).toBe(409);
    publisher.error = new PublishError('unauthorized', 'no');
    expect((await post(`/api/projects/${id}/publish`)).statusCode).toBe(502);
    expect(store.getProject(id)!.repoUrl).toBeNull();
  });

  it('answers 503 without a GitHub token and reports canPublish', async () => {
    const plain = buildApp({ config, store, router: new StubRouterClient(validReply) });
    const id = await project();
    expect((await plain.inject({ method: 'POST', url: `/api/projects/${id}/publish`, headers: owner, payload: {} })).statusCode).toBe(503);
    expect((await plain.inject({ url: '/api/me', headers: owner })).json().canPublish).toBe(false);
    expect((await app.inject({ url: '/api/me', headers: owner })).json().canPublish).toBe(true);
    await plain.close();
  });
});

describe('GithubPublisher', () => {
  type Call = { method: string; path: string; body: { tree?: unknown; base_tree?: string; sha?: string } | undefined; auth: string | null };
  function fake(handler: (c: Call) => { status: number; json: unknown }) {
    const calls: Call[] = [];
    const fetchStub = (async (url: string, init: RequestInit) => {
      const call = {
        method: init.method!,
        path: new URL(url).pathname,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        auth: new Headers(init.headers).get('authorization'),
      };
      calls.push(call);
      const r = handler(call);
      return new Response(JSON.stringify(r.json), { status: r.status });
    }) as unknown as typeof fetch;
    return { calls, fetchStub };
  }
  const files = [{ path: 'docs/a.md', content: 'hi' }];
  const happy = (c: Call) => {
    if (c.method === 'POST' && c.path === '/user/repos') return { status: 201, json: { full_name: 'me/r', html_url: 'https://github.com/me/r', default_branch: 'main' } };
    if (c.path.endsWith('/git/ref/heads/main')) return { status: 200, json: { object: { sha: 'c0' } } };
    if (c.path.endsWith('/git/commits/c0')) return { status: 200, json: { tree: { sha: 't0' } } };
    if (c.path.endsWith('/git/trees')) return { status: 201, json: { sha: 't1' } };
    if (c.path.endsWith('/git/commits')) return { status: 201, json: { sha: 'c1' } };
    return { status: 200, json: {} };
  };

  it('creates a private repo and commits all files on top of the initial commit', async () => {
    const { calls, fetchStub } = fake(happy);
    const res = await new GithubPublisher({ token: 'ghp_x', fetch: fetchStub, retryDelayMs: 0 }).publish({ name: 'r', description: 'd', files });
    expect(res).toEqual({ url: 'https://github.com/me/r', fullName: 'me/r' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/user/repos', auth: 'Bearer ghp_x', body: { name: 'r', private: true } });
    expect(calls.find((c) => c.path.endsWith('/git/trees'))!.body).toMatchObject({ base_tree: 't0', tree: [{ path: 'docs/a.md', content: 'hi' }] });
    expect(calls.find((c) => c.path.endsWith('/git/commits') && c.method === 'POST')!.body).toMatchObject({ tree: 't1', parents: ['c0'] });
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', path: '/repos/me/r/git/refs/heads/main', body: { sha: 'c1' } });
  });

  it('creates in the organisation when one is set', async () => {
    const { calls, fetchStub } = fake((c) => (c.path === '/orgs/acme/repos' ? happy({ ...c, path: '/user/repos' }) : happy(c)));
    await new GithubPublisher({ token: 't', owner: 'acme', fetch: fetchStub, retryDelayMs: 0 }).publish({ name: 'r', description: 'd', files });
    expect(calls[0]!.path).toBe('/orgs/acme/repos');
  });

  it('waits for the first commit to appear', async () => {
    let refs = 0;
    const { fetchStub } = fake((c) => (c.path.includes('/git/ref/') && refs++ < 2 ? { status: 404, json: {} } : happy(c)));
    await expect(new GithubPublisher({ token: 't', fetch: fetchStub, retryDelayMs: 0 }).publish({ name: 'r', description: 'd', files })).resolves.toBeDefined();
    expect(refs).toBe(3);
  });

  it.each([
    [422, 'name_taken'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [503, 'github_unavailable'],
    [400, 'github_rejected'],
  ])('maps a %i on create to %s', async (status, code) => {
    const { fetchStub } = fake(() => ({ status, json: { message: 'nope' } }));
    const p = new GithubPublisher({ token: 'secret-token', fetch: fetchStub, retryDelayMs: 0 }).publish({ name: 'r', description: 'd', files });
    await expect(p).rejects.toMatchObject({ code });
    await p.catch((e: Error) => expect(e.message).not.toContain('secret-token'));
  });

  it('reports an unreachable GitHub', async () => {
    const fetchStub = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(new GithubPublisher({ token: 't', fetch: fetchStub }).publish({ name: 'r', description: 'd', files })).rejects.toMatchObject({ code: 'github_unavailable' });
  });
});
