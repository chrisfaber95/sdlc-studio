import type { GenerateRequest, GenerateResult, RouterClient } from './types.ts';

type Reply = Partial<GenerateResult> | Error;

/** Router for tests: replies from a queue (or a handler) and records every call. Never touches the network. */
export class StubRouterClient implements RouterClient {
  readonly calls: GenerateRequest[] = [];
  readonly #queue: Reply[] = [];
  readonly #handler: ((req: GenerateRequest) => Reply) | undefined;

  constructor(handler?: (req: GenerateRequest) => Reply) {
    this.#handler = handler;
  }

  enqueue(...replies: Reply[]): this {
    this.#queue.push(...replies);
    return this;
  }

  generate(req: GenerateRequest): Promise<GenerateResult> {
    this.calls.push(req);
    const reply = this.#queue.shift() ?? this.#handler?.(req);
    if (!reply) return Promise.reject(new Error('StubRouterClient: no reply queued'));
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({ content: '{}', tier: req.tier, citations: [], ...reply });
  }
}
