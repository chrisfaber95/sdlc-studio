import type { ZipEntry } from '../pipeline/zip.ts';

export interface PublishRequest {
  name: string;
  description: string;
  files: ZipEntry[];
}

export interface PublishResult {
  /** Browser URL of the new repository. */
  url: string;
  fullName: string;
}

export type PublishErrorCode = 'name_taken' | 'unauthorized' | 'github_unavailable' | 'github_rejected';

/** A failed publish, typed so the API can map it to a status. The token never appears in the message. */
export class PublishError extends Error {
  readonly code: PublishErrorCode;
  constructor(code: PublishErrorCode, message: string) {
    super(message);
    this.name = 'PublishError';
    this.code = code;
  }
}

/** Puts a project's files in a new private repository. Real: `GithubPublisher`; tests use a stub. */
export interface Publisher {
  publish(req: PublishRequest): Promise<PublishResult>;
}

export interface GithubOptions {
  token: string;
  /** Organisation to create the repository in; empty means the token owner's account. */
  owner?: string;
  apiUrl?: string;
  fetch?: typeof fetch;
  /** Wait between attempts to read the first commit of a fresh repository. */
  retryDelayMs?: number;
}

interface Repo {
  full_name: string;
  html_url: string;
  default_branch: string;
}

const REF_ATTEMPTS = 5;

/**
 * Creates a private repository through the GitHub REST API and commits all files in one commit (git data API,
 * so no git binary or local checkout is needed). The repository is created with an initial commit, because the
 * git data API refuses an empty repository; our commit goes on top of it.
 */
export class GithubPublisher implements Publisher {
  readonly #o: Required<Omit<GithubOptions, 'token'>> & { token: string };

  constructor(o: GithubOptions) {
    this.#o = {
      token: o.token,
      owner: o.owner ?? '',
      apiUrl: (o.apiUrl ?? 'https://api.github.com').replace(/\/+$/, ''),
      fetch: o.fetch ?? fetch,
      retryDelayMs: o.retryDelayMs ?? 500,
    };
  }

  async #call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    let res: Response;
    try {
      res = await this.#o.fetch(`${this.#o.apiUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.#o.token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'sdlc-studio',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new PublishError('github_unavailable', 'Could not reach GitHub.');
    }
    const data = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, data };
  }

  #fail(status: number, data: { message?: string }): never {
    if (status === 401 || status === 403) {
      throw new PublishError('unauthorized', 'GitHub refused the token (it needs rights to create repositories and write contents).');
    }
    if (status >= 500) throw new PublishError('github_unavailable', `GitHub answered ${status}.`);
    throw new PublishError('github_rejected', `GitHub rejected the request (${status}): ${data.message ?? 'no reason given'}`);
  }

  async #ok<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { status, data } = await this.#call<T & { message?: string }>(method, path, body);
    if (status >= 200 && status < 300) return data;
    return this.#fail(status, data);
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const create = await this.#call<Repo & { message?: string; errors?: { message?: string }[] }>(
      'POST',
      this.#o.owner ? `/orgs/${encodeURIComponent(this.#o.owner)}/repos` : '/user/repos',
      { name: req.name, description: req.description.slice(0, 350), private: true, auto_init: true },
    );
    if (create.status === 422) {
      throw new PublishError('name_taken', `GitHub cannot create "${req.name}": ${create.data.errors?.[0]?.message ?? create.data.message ?? 'name already in use'}.`);
    }
    if (create.status < 200 || create.status >= 300) this.#fail(create.status, create.data);
    const repo = create.data;
    const base = `/repos/${repo.full_name}`;

    // The initial commit can lag a moment behind the create call.
    let head: { object: { sha: string } } | undefined;
    for (let i = 0; i < REF_ATTEMPTS && !head; i++) {
      const ref = await this.#call<{ object: { sha: string } }>('GET', `${base}/git/ref/heads/${repo.default_branch}`);
      if (ref.status === 200) head = ref.data;
      else if (i < REF_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, this.#o.retryDelayMs));
    }
    if (!head) throw new PublishError('github_unavailable', `The repository ${repo.full_name} was created but its first commit never appeared.`);

    const parent = await this.#ok<{ tree: { sha: string } }>('GET', `${base}/git/commits/${head.object.sha}`);
    const tree = await this.#ok<{ sha: string }>('POST', `${base}/git/trees`, {
      base_tree: parent.tree.sha,
      tree: req.files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
    });
    const commit = await this.#ok<{ sha: string }>('POST', `${base}/git/commits`, {
      message: 'Initial project from sdlc-studio',
      tree: tree.sha,
      parents: [head.object.sha],
    });
    await this.#ok('PATCH', `${base}/git/refs/heads/${repo.default_branch}`, { sha: commit.sha });
    return { url: repo.html_url, fullName: repo.full_name };
  }
}
