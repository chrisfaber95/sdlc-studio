import type { ArtifactKind, Tier } from '../db/model.ts';
import { isOneOf, TIERS } from '../db/model.ts';

export interface GenerateRequest {
  stage: ArtifactKind;
  tier: Tier;
  system: string;
  prompt: string;
}

export interface Citation {
  title: string;
  url: string;
}

export interface GenerateResult {
  content: string;
  /** The tier that actually served the call, as reported by the router. */
  tier: Tier;
  citations: Citation[];
}

export interface RouterClient {
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

export type RouterErrorCode =
  | 'unavailable' // connection refused, DNS failure, 5xx
  | 'timeout'
  | 'unauthorized' // 401/403: bad or missing router token
  | 'rejected' // other 4xx: the router refused the request
  | 'bad_response'; // 2xx but not the expected shape

export class RouterError extends Error {
  readonly code: RouterErrorCode;
  readonly status: number | undefined;

  constructor(code: RouterErrorCode, message: string, opts: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = 'RouterError';
    this.code = code;
    this.status = opts.status;
  }
}

/** Parses a 200 body of the router's POST /v1/route. */
export function parseGenerateResult(body: unknown): GenerateResult {
  if (typeof body !== 'object' || body === null) throw new RouterError('bad_response', 'Router returned no object');
  const b = body as Record<string, unknown>;
  if (typeof b.output !== 'string' || b.output === '') {
    throw new RouterError('bad_response', 'Router response has no output');
  }
  // `backend` is what actually answered (after an escalation it differs from the tier asked for).
  if (!isOneOf(TIERS, b.backend)) {
    throw new RouterError('bad_response', `Router response has no valid backend (got ${JSON.stringify(b.backend)})`);
  }
  const citations: Citation[] = [];
  if (Array.isArray(b.citations)) {
    for (const c of b.citations) {
      const r = c as Record<string, unknown> | null;
      if (r && typeof r.url === 'string') citations.push({ title: typeof r.title === 'string' ? r.title : r.url, url: r.url });
    }
  }
  return { content: b.output, tier: b.backend, citations };
}
