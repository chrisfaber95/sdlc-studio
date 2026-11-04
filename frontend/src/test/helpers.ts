import { vi } from 'vitest';
import type { Artifact, ArtifactKind, Project } from '../types';

export interface Call {
  method: string;
  url: string;
  body: unknown;
}

type Handler = (call: Call) => unknown | Response;

/** Stubs fetch: the handler returns a JSON body or a Response; every call is recorded. */
export function stubApi(handler: Handler): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const call = { method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const out = handler(call);
    return out instanceof Response ? out : new Response(JSON.stringify(out ?? {}));
  });
  return calls;
}

export const failure = (status: number, error: string, message: string) =>
  new Response(JSON.stringify({ error, message }), { status });

export const project = (over: Partial<Project> = {}): Project => ({
  id: 1,
  title: 'Demo',
  stack: 'vue',
  stage: 'ideate',
  isExample: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...over,
});

export const artifact = (kind: ArtifactKind, version: number, content: unknown, over: Partial<Artifact> = {}): Artifact => ({
  id: version * 10 + kind.length,
  projectId: 1,
  kind,
  version,
  content: JSON.stringify(content),
  prompt: null,
  tier: 'local',
  createdAt: '2026-01-01',
  ...over,
});

export const idea = (title: string) => ({
  title,
  summary: `About ${title}`,
  effort: 'small',
  estimateHours: 8,
  noveltyScore: 7,
  skillTags: ['vue', 'testing'],
});

export const requirements = (want: string) => ({
  userStories: [{ id: 'US-1', role: 'owner', want, benefit: 'it works', acceptanceCriteria: [{ id: 'AC-1', text: 'Works' }] }],
});

export const architecture = {
  overview: 'Overview text',
  components: [{ name: 'Api', responsibility: 'Serves', technology: 'Fastify' }],
  dataModel: [{ entity: 'Project', fields: [{ name: 'id', type: 'int' }] }],
  decisions: [{ id: 'D-1', title: 'Use SQLite', context: 'c', decision: 'd', consequences: 'e' }],
  diagrams: [{ title: 'Flow', mermaid: 'flowchart TD\n A-->B' }],
};
