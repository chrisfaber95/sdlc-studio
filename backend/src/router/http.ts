import { parseGenerateResult, RouterError } from './types.ts';
import type { GenerateRequest, GenerateResult, RouterClient } from './types.ts';

export const CALLER = 'sdlc-studio';

export interface HttpRouterOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * HTTP client for the homelab LLM router (H-012).
 *
 * ASSUMED wire format, to be checked against H-012's docs once the router is built (it was not
 * available when this was written):
 *   POST {baseUrl}/v1/generate  Authorization: Bearer <token>
 *   { caller, tier, system, prompt }  ->  { content, tier, citations? }
 * Only this file knows the format.
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
      res = await fetch(`${baseUrl}/v1/generate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ caller: CALLER, tier: req.tier, system: req.system, prompt: req.prompt }),
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
