import { parseGenerateResult, RouterError } from './types.ts';
import type { GenerateRequest, GenerateResult, RouterClient } from './types.ts';
import type { Tier } from '../db/model.ts';

export const CALLER = 'sdlc-studio';

export interface HttpRouterOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * The router's tier for each of our tiers. Our tiers name the backend we want (local model or Claude);
 * the router's tier table (config/router.json in homelab) maps `easy` to local and `hard` to Claude.
 */
export const ROUTER_TIERS: Readonly<Record<Tier, string>> = { local: 'easy', claude: 'hard' };

/**
 * HTTP client for the homelab LLM router (H-012, docs/router.md in homelab):
 *   POST {baseUrl}/v1/route  { caller, tier, system, prompt }
 *     200 { request_id, output, backend, outcome, ... }    4xx/5xx { error: { code, message, request_id } }
 * The router has no token today; one is sent as a bearer token if configured. Only this file knows the format.
 */
export class HttpRouterClient implements RouterClient {
  readonly #opts: Required<Omit<HttpRouterOptions, 'fetch'>> & { fetch: typeof fetch };

  constructor(opts: HttpRouterOptions) {
    this.#opts = { timeoutMs: 300_000, fetch: globalThis.fetch, ...opts };
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const { baseUrl, token, timeoutMs, fetch } = this.#opts;
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/v1/route`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ caller: CALLER, tier: ROUTER_TIERS[req.tier], system: req.system, prompt: req.prompt }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new RouterError(timedOut ? 'timeout' : 'unavailable', timedOut ? 'Router timed out' : 'Router is unreachable', {
        cause: err,
      });
    }
    if (!res.ok) {
      const { status } = res;
      const code = await errorCode(res);
      if (code === 'timeout') throw new RouterError('timeout', 'Router timed out', { status });
      if (status === 401 || status === 403) throw new RouterError('unauthorized', 'Router refused the token', { status });
      if (status >= 500) throw new RouterError('unavailable', `Router failed with HTTP ${status}`, { status });
      throw new RouterError('rejected', `Router rejected the request with HTTP ${status}`, { status });
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new RouterError('bad_response', 'Router returned invalid JSON', { cause: err });
    }
    return parseGenerateResult(body);
  }
}

/** The router's `error.code` (for example `timeout`, `claude_error`), if the body has one. */
async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === 'string' ? body.error.code : undefined;
  } catch {
    return undefined;
  }
}
