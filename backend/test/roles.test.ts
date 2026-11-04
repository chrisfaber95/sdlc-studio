import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.ts';
import { Store } from '../src/db/store.ts';
import { buildApp } from '../src/http/app.ts';

const config = loadConfig({ SDLC_OWNER_IDENTITIES: 'chris@example.com', SDLC_OWNER_TOKEN: 'secret-token' });
const owner = { authorization: 'Bearer secret-token' };

let app: FastifyInstance;
let store: Store;
let exampleId: number;
let privateId: number;

beforeEach(() => {
  store = new Store(':memory:');
  exampleId = store.createProject({ title: 'demo', stack: 'vue', isExample: true }).id;
  privateId = store.createProject({ title: 'secret idea', stack: 'go' }).id;
  for (const id of [exampleId, privateId]) store.addArtifact({ projectId: id, kind: 'idea', content: 'c', tier: 'local' });
  app = buildApp({ config, store });
});
afterEach(() => app.close());

const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers = {}, payload?: object) =>
  app.inject({ method, url, headers, ...(payload && { payload }) });

describe('visitor', () => {
  it('sees only example projects', async () => {
    const res = await call('GET', '/api/projects');
    expect(res.json().map((p: { title: string }) => p.title)).toEqual(['demo']);
  });

  it('reads artifacts of an example, including the tier', async () => {
    const res = await call('GET', `/api/projects/${exampleId}/artifacts`);
    expect(res.statusCode).toBe(200);
    expect(res.json()[0]).toMatchObject({ kind: 'idea', version: 1, tier: 'local' });
  });

  it('gets 404 for a non-example project and its artifacts', async () => {
    expect((await call('GET', `/api/projects/${privateId}`)).statusCode).toBe(404);
    expect((await call('GET', `/api/projects/${privateId}/artifacts`)).statusCode).toBe(404);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('is refused with 403 on %s, whatever the path', async (method) => {
    for (const url of ['/api/projects', `/api/projects/${exampleId}`, `/api/projects/${exampleId}/generate`, '/nowhere']) {
      expect((await call(method, url, {}, { title: 'x', stack: 'go', stage: 'retro' })).statusCode).toBe(403);
    }
  });

  it('cannot move a project, and nothing changes', async () => {
    await call('PATCH', `/api/projects/${exampleId}`, {}, { stage: 'retro' });
    expect(store.getProject(exampleId)?.stage).toBe('ideate');
    expect(store.listProjects()).toHaveLength(2);
  });

  it('is not made owner by a Tailscale header from a non-loopback peer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      remoteAddress: '100.64.0.9',
      headers: { 'tailscale-user-login': 'chris@example.com' },
      payload: { title: 'x', stack: 'go' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('is not made owner by a wrong token or a non-owner identity', async () => {
    expect((await call('POST', '/api/projects', { authorization: 'Bearer nope' }, { title: 'x', stack: 'go' })).statusCode).toBe(403);
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      remoteAddress: '127.0.0.1',
      headers: { 'tailscale-user-login': 'friend@example.com' },
      payload: { title: 'x', stack: 'go' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('gets no owner access when no owner token is configured and the header is empty', async () => {
    const open = buildApp({ config: loadConfig({}), store });
    const res = await open.inject({ method: 'POST', url: '/api/projects', headers: { authorization: 'Bearer ' }, payload: { title: 'x', stack: 'go' } });
    expect(res.statusCode).toBe(403);
    await open.close();
  });
});

describe('owner', () => {
  it('sees everything', async () => {
    expect((await call('GET', '/api/projects', owner)).json()).toHaveLength(2);
    expect((await call('GET', `/api/projects/${privateId}`, owner)).statusCode).toBe(200);
  });

  it('is recognised by Tailscale identity from loopback', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      remoteAddress: '127.0.0.1',
      headers: { 'tailscale-user-login': 'Chris@Example.com' },
    });
    expect(res.json()).toEqual({ role: 'owner', identity: 'chris@example.com' });
  });

  it('creates a project and moves it between stages', async () => {
    const created = await call('POST', '/api/projects', owner, { title: 'new', stack: 'rust' });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const moved = await call('PATCH', `/api/projects/${id}`, owner, { stage: 'build' });
    expect(moved.json().stage).toBe('build');
    expect(store.getProject(id)?.stage).toBe('build');
  });

  it('gets 400 for invalid input', async () => {
    expect((await call('POST', '/api/projects', owner, { title: 'x', stack: 'cobol' })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/projects/${exampleId}`, owner, { stage: 'nope' })).statusCode).toBe(400);
  });
});
