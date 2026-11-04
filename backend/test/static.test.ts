import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.ts';
import { Store } from '../src/db/store.ts';
import { buildApp } from '../src/http/app.ts';
import { StubRouterClient } from '../src/router/stub.ts';

let dir: string;
let app: FastifyInstance;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'sdlc-static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>sdlc-studio</title>');
  writeFileSync(join(dir, 'assets', 'app-1234.js'), 'console.log(1)');
  writeFileSync(join(tmpdir(), 'sdlc-static-outside.txt'), 'outside');
  app = buildApp({ config: loadConfig({ SDLC_STATIC_DIR: dir }), store: new Store(':memory:'), router: new StubRouterClient() });
});
afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('static frontend', () => {
  it('serves index.html at the root', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('sdlc-studio');
  });

  it('serves hashed assets with a long cache', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app-1234.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/javascript');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('falls back to index.html for unknown paths and never leaves the folder', async () => {
    for (const url of ['/board', '/../sdlc-static-outside.txt', '/%2e%2e/sdlc-static-outside.txt']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('outside');
    }
  });

  it('keeps unknown API paths a JSON 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('is off when the folder has no index.html', async () => {
    const api = buildApp({ config: loadConfig({ SDLC_STATIC_DIR: join(dir, 'assets') }), store: new Store(':memory:'), router: new StubRouterClient() });
    expect((await api.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
    await api.close();
  });
});
