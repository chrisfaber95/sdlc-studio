import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioApiError, StudioClient } from '../src/client/studio-client.ts';
import { loadConfig } from '../src/config.ts';
import { Store } from '../src/db/store.ts';
import { buildApp } from '../src/http/app.ts';
import { unzip } from '../src/pipeline/zip.ts';
import { STAGE_TIERS } from '../src/router/prompts.ts';
import { StubRouterClient } from '../src/router/stub.ts';
import { validReply } from './fixtures.ts';

let app: FastifyInstance;
let store: Store;
let router: StubRouterClient;
let baseUrl: string;

beforeEach(async () => {
  store = new Store(':memory:');
  router = new StubRouterClient(validReply);
  app = buildApp({ config: loadConfig({ SDLC_OWNER_TOKEN: 'tok' }), store, router });
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
});
afterEach(() => app.close());

describe('StudioClient against the running backend (stubbed router)', () => {
  it('takes an idea to a ZIP, lists the project in its stage and versions a steered regeneration', async () => {
    const client = new StudioClient({ baseUrl, token: 'tok' });

    const { ideas, tier } = await client.ideas({ stack: 'typescript', topic: 'habits', effort: 'small' });
    expect(ideas.length).toBeGreaterThanOrEqual(3);
    expect(tier).toBe(STAGE_TIERS.idea);

    const { project } = await client.chooseIdea({ stack: 'typescript', idea: ideas[0]! });
    expect(project.stage).toBe('ideate');

    for (const kind of ['requirements', 'architecture', 'test_plan', 'scaffold'] as const) {
      const art = await client.generate(project.id, kind);
      expect(art).toMatchObject({ kind, version: 1, tier: STAGE_TIERS[kind] });
    }
    // Steering produces version 2; version 1 stays viewable.
    const steered = await client.generate(project.id, 'architecture', 'use event sourcing');
    expect(steered).toMatchObject({ version: 2, prompt: 'use event sourcing' });
    expect(steered.content).toContain('[use event sourcing]');
    const versions = await client.artifacts(project.id, 'architecture');
    expect(versions.map((a) => a.version)).toEqual([1, 2]);
    expect(router.calls.every((c) => c.tier === STAGE_TIERS[c.stage])).toBe(true);

    // The board sees it like any other project.
    const listed = (await client.projects()).find((p) => p.id === project.id);
    expect(listed).toMatchObject({ stage: 'ideate', title: project.title });
    const all = await client.artifacts(project.id);
    expect(all.map((a) => a.kind).sort()).toEqual(['architecture', 'architecture', 'idea', 'requirements', 'scaffold', 'test_plan']);
    expect(all.every((a) => a.tier === STAGE_TIERS[a.kind])).toBe(true);

    const dir = await mkdtemp(join(tmpdir(), 'sdlc-zip-'));
    const target = join(dir, 'project.zip');
    const bytes = await client.downloadTo(project.id, target);
    const files = unzip(await readFile(target));
    expect(bytes).toBeGreaterThan(0);
    expect([...files.keys()].some((n) => n.endsWith('src/index.ts'))).toBe(true);
  });

  it('is refused on every write without the owner token, and nothing is stored', async () => {
    const anon = new StudioClient({ baseUrl, token: '' });
    const wrong = new StudioClient({ baseUrl, token: 'nope' });
    for (const c of [anon, wrong]) {
      await expect(c.ideas({ stack: 'go', topic: 't', effort: 'small' })).rejects.toMatchObject({ status: 403 });
      await expect(c.chooseIdea({ stack: 'go', idea: validIdea() })).rejects.toBeInstanceOf(StudioApiError);
    }
    expect(store.listProjects()).toHaveLength(0);
    expect(router.calls).toHaveLength(0);
  });
});

const validIdea = () => ({ title: 'x', summary: 's', effort: 'small' as const, estimateHours: 4, noveltyScore: 5, skillTags: ['a'] });
