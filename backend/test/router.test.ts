import { describe, expect, it } from 'vitest';
import { HttpRouterClient } from '../src/router/http.ts';
import { StubRouterClient } from '../src/router/stub.ts';
import { RouterError } from '../src/router/types.ts';
import type { RouterErrorCode } from '../src/router/types.ts';

const req = { stage: 'idea', tier: 'local', system: 's', prompt: 'p' } as const;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const client = (f: typeof fetch) => new HttpRouterClient({ baseUrl: 'http://router', token: 'tok', fetch: f });
const codeOf = async (p: Promise<unknown>): Promise<RouterErrorCode | undefined> => {
  try {
    await p;
  } catch (e) {
    return e instanceof RouterError ? e.code : undefined;
  }
  return undefined;
};

describe('HttpRouterClient', () => {
  it('sends caller, tier and token, and returns the serving tier', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const c = client(async (url, init) => {
      seen = { url: String(url), init: init! };
      return json({ output: 'hello', backend: 'claude', citations: [{ title: 't', url: 'http://x' }] });
    });
    const res = await c.generate({ ...req, tier: 'local' });
    expect(res).toEqual({ content: 'hello', tier: 'claude', citations: [{ title: 't', url: 'http://x' }] });
    expect(seen?.url).toBe('http://router/v1/route');
    expect(JSON.parse(seen?.init.body as string)).toMatchObject({ caller: 'sdlc-studio', tier: 'easy' });
    expect((seen?.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it.each([
    [500, 'unavailable'],
    [503, 'unavailable'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [422, 'rejected'],
  ] as const)('maps HTTP %i to %s', async (status, code) => {
    expect(await codeOf(client(async () => json({}, status)).generate(req))).toBe(code);
  });

  it('asks the router for tier hard when the stage wants Claude', async () => {
    let body: Record<string, unknown> = {};
    const c = client(async (_url, init) => {
      body = JSON.parse(init!.body as string) as Record<string, unknown>;
      return json({ output: 'x', backend: 'claude' });
    });
    await c.generate({ ...req, tier: 'claude' });
    expect(body.tier).toBe('hard');
  });

  it("maps the router's timeout error to timeout", async () => {
    const c = client(async () => json({ error: { code: 'timeout', message: 'too slow' } }, 504));
    expect(await codeOf(c.generate(req))).toBe('timeout');
  });

  it('maps a network failure to unavailable', async () => {
    const c = client(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await codeOf(c.generate(req))).toBe('unavailable');
  });

  it('maps a timeout to timeout', async () => {
    const c = client(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    expect(await codeOf(c.generate(req))).toBe('timeout');
  });

  it.each([
    ['invalid JSON', () => new Response('<html>', { status: 200 })],
    ['missing output', () => json({ backend: 'local' })],
    ['empty output', () => json({ output: '', backend: 'local' })],
    ['missing backend', () => json({ output: 'x' })],
    ['unknown backend', () => json({ output: 'x', backend: 'gpt' })],
  ])('maps %s to bad_response', async (_n, make) => {
    expect(await codeOf(client(async () => make()).generate(req))).toBe('bad_response');
  });
});

describe('StubRouterClient', () => {
  it('replies from the queue, records calls and can fail', async () => {
    const stub = new StubRouterClient().enqueue({ content: 'a', tier: 'claude' }, new RouterError('unavailable', 'down'));
    expect(await stub.generate(req)).toMatchObject({ content: 'a', tier: 'claude' });
    expect(await codeOf(stub.generate(req))).toBe('unavailable');
    expect(stub.calls).toHaveLength(2);
  });
});
