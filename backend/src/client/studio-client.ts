import { writeFile } from 'node:fs/promises';
import type { Artifact, ArtifactKind, Project, Stack, Tier } from '../db/model.ts';
import type { Idea, Effort } from '../pipeline/artifact-schemas.ts';
import type { GeneratedKind } from '../pipeline/service.ts';

/** A non-2xx answer from the app. `status` 403 means the call was made without owner access. */
export class StudioApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'StudioApiError';
    this.status = status;
    this.code = code;
  }
}

export interface StudioClientOptions {
  baseUrl: string;
  /** Owner token; sent as a Bearer header and never logged or echoed in errors. */
  token: string;
  fetch?: typeof fetch;
}

/** Reads SDLC_URL and SDLC_OWNER_TOKEN; the skill passes no secrets on the command line. */
export function clientFromEnv(env: Record<string, string | undefined> = process.env): StudioClient {
  const baseUrl = env.SDLC_URL?.trim();
  if (!baseUrl) throw new Error('SDLC_URL is not set (the base URL of the sdlc-studio app).');
  return new StudioClient({ baseUrl, token: env.SDLC_OWNER_TOKEN ?? '' });
}

/**
 * Thin typed client of the app's HTTP API. It holds no generation logic: every generation happens in
 * the app, through the router, and comes back with the tier that made it.
 */
export class StudioClient {
  readonly #base: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(opts: StudioClientOptions) {
    this.#base = opts.baseUrl.replace(/\/+$/, '');
    this.#token = opts.token;
    this.#fetch = opts.fetch ?? fetch;
  }

  async #send(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.#token) headers.authorization = `Bearer ${this.#token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.#fetch(`${this.#base}${path}`, { method, headers, ...(body !== undefined && { body: JSON.stringify(body) }) });
    if (res.ok) return res;
    const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new StudioApiError(res.status, err.error ?? 'error', err.message ?? `HTTP ${res.status}`);
  }

  async #json<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await (await this.#send(method, path, body)).json()) as T;
  }

  ideas(req: { stack: Stack; topic: string; effort: Effort; prompt?: string }): Promise<{ ideas: Idea[]; tier: Tier }> {
    return this.#json('POST', '/api/ideas', req);
  }

  chooseIdea(req: { stack: Stack; idea: Idea; prompt?: string }): Promise<{ project: Project; artifact: Artifact }> {
    return this.#json('POST', '/api/projects/from-idea', req);
  }

  /** Generates a stage; with `prompt` it steers the result, and a repeat call stores a new version. */
  generate(projectId: number, kind: GeneratedKind, prompt?: string): Promise<Artifact> {
    return this.#json('POST', `/api/projects/${projectId}/generate/${kind}`, prompt ? { prompt } : {});
  }

  projects(): Promise<Project[]> {
    return this.#json('GET', '/api/projects');
  }

  artifacts(projectId: number, kind?: ArtifactKind): Promise<Artifact[]> {
    return this.#json('GET', `/api/projects/${projectId}/artifacts${kind ? `?kind=${kind}` : ''}`);
  }

  async download(projectId: number): Promise<Buffer> {
    return Buffer.from(await (await this.#send('GET', `/api/projects/${projectId}/download`)).arrayBuffer());
  }

  /** Downloads the project ZIP to `path` and returns the number of bytes written. */
  async downloadTo(projectId: number, path: string): Promise<number> {
    const data = await this.download(projectId);
    await writeFile(path, data);
    return data.length;
  }
}
