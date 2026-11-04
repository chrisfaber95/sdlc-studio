import type { Artifact, GeneratedKind, Idea, Me, Project, Stack, Stage, Effort } from './types';

/** An API failure with the server's own message, so the UI can show why something failed. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: { method: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('Could not reach the server.', 0, 'network');
  }
  if (!res.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // Not JSON; fall back to the status line.
    }
    throw new ApiError(body.message ?? `The server answered ${res.status}.`, res.status, body.error ?? 'error');
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => request<Me>('/api/me'),
  projects: () => request<Project[]>('/api/projects'),
  project: (id: number) => request<Project>(`/api/projects/${id}`),
  artifacts: (id: number) => request<Artifact[]>(`/api/projects/${id}/artifacts`),
  ideas: async (input: { stack: Stack; topic: string; effort: Effort; prompt?: string }) =>
    (await request<{ ideas: Idea[] }>('/api/ideas', { method: 'POST', body: input })).ideas,
  chooseIdea: (stack: Stack, idea: Idea) =>
    request<{ project: Project; artifact: Artifact }>('/api/projects/from-idea', {
      method: 'POST',
      body: { stack, idea },
    }),
  generate: (id: number, kind: GeneratedKind, prompt?: string) =>
    request<Artifact>(`/api/projects/${id}/generate/${kind}`, { method: 'POST', body: prompt ? { prompt } : {} }),
  moveProject: (id: number, stage: Stage) =>
    request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: { stage } }),
  publish: (id: number, name?: string) =>
    request<Project>(`/api/projects/${id}/publish`, { method: 'POST', body: name ? { name } : {} }),
  downloadUrl: (id: number) => `/api/projects/${id}/download`,
};

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : 'Something went wrong.');
