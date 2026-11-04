import type { Artifact, ArtifactKind, Project, Stack } from '../db/model.ts';
import type { Store } from '../db/store.ts';
import { buildPrompt, tierFor } from '../router/prompts.ts';
import type { PromptStage } from '../router/prompts.ts';
import { RouterError } from '../router/types.ts';
import type { Citation, GenerateResult, RouterClient, } from '../router/types.ts';
import type { Tier } from '../db/model.ts';
import {
  checkTestPlanLinks,
  parseArchitecture,
  parseIdea,
  parseIdeas,
  parseModelJson,
  parseRequirements,
  parseScaffold,
  parseTestPlan,
  SchemaError,
} from './artifact-schemas.ts';
import type { Effort, Idea, Requirements } from './artifact-schemas.ts';

export const GENERATED_KINDS = ['requirements', 'architecture', 'test_plan', 'scaffold'] as const;
export type GeneratedKind = (typeof GENERATED_KINDS)[number];

/** Strict stage order: each stage is built from the latest artifact of the one before it. */
const PREVIOUS: Record<GeneratedKind, ArtifactKind> = {
  requirements: 'idea',
  architecture: 'requirements',
  test_plan: 'architecture',
  scaffold: 'test_plan',
};

export class PipelineError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string, opts: { cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = 'PipelineError';
    this.code = code;
    this.status = status;
  }
}

function fromRouter(err: unknown): PipelineError {
  if (err instanceof RouterError) {
    const status = err.code === 'timeout' ? 504 : 502;
    return new PipelineError(`router_${err.code}`, status, `Generation failed, nothing was stored: ${err.message}.`, { cause: err });
  }
  return new PipelineError('router_failed', 502, 'Generation failed, nothing was stored: the router call failed.', { cause: err });
}

export interface IdeaRequest {
  stack: Stack;
  topic: string;
  effort: Effort;
  prompt?: string | undefined;
}

export class Pipeline {
  readonly #store: Store;
  readonly #router: RouterClient;

  constructor(store: Store, router: RouterClient) {
    this.#store = store;
    this.#router = router;
  }

  async #call(stage: PromptStage, built: { system: string; prompt: string }): Promise<GenerateResult> {
    try {
      return await this.#router.generate({ stage, tier: tierFor(stage), ...built });
    } catch (err) {
      throw fromRouter(err);
    }
  }

  /** Parses router output; invalid output is a failed generation. */
  #parse<T>(raw: GenerateResult, parse: (v: unknown) => T): T {
    try {
      return parse(parseModelJson(raw.content));
    } catch (err) {
      if (err instanceof SchemaError) {
        throw new PipelineError('invalid_output', 502, `Generation failed, nothing was stored: the router output was invalid (${err.message}).`, { cause: err });
      }
      throw err;
    }
  }

  async generateIdeas(req: IdeaRequest): Promise<{ ideas: Idea[]; tier: Tier }> {
    const built = buildPrompt({
      stage: 'idea',
      stack: req.stack,
      facts: [`Topic: ${req.topic}`, `Effort: ${req.effort}`],
      extraPrompt: req.prompt,
    });
    const raw = await this.#call('idea', built);
    return { ideas: this.#parse(raw, parseIdeas), tier: raw.tier };
  }

  /** Choosing an idea creates the project, in stage "ideate", with the idea as artifact version 1. */
  chooseIdea(input: { stack: Stack; idea: unknown; tier: Tier; prompt?: string | null }): { project: Project; artifact: Artifact } {
    const idea = parseIdea(input.idea);
    const project = this.#store.createProject({ title: idea.title, stack: input.stack, stage: 'ideate' });
    const artifact = this.#store.addArtifact({
      projectId: project.id,
      kind: 'idea',
      content: JSON.stringify(idea),
      prompt: input.prompt ?? null,
      tier: input.tier,
    });
    return { project, artifact };
  }

  /**
   * Generates the next version of a stage. Nothing is stored unless the router answered and the answer
   * passed its schema; earlier artifacts are never touched.
   */
  async generate(project: Project, kind: GeneratedKind, extraPrompt?: string): Promise<Artifact> {
    const prevKind = PREVIOUS[kind];
    const prev = this.#store.latestArtifact(project.id, prevKind);
    if (!prev) {
      throw new PipelineError('missing_previous_stage', 409, `Generate ${prevKind} first: ${kind} is built from it.`);
    }
    const inputs = [{ label: `Latest ${prevKind} (JSON)`, json: prev.content }];
    let requirements: Requirements | undefined;
    if (kind === 'test_plan') {
      const req = this.#store.latestArtifact(project.id, 'requirements');
      if (!req) throw new PipelineError('missing_previous_stage', 409, 'Generate requirements first: the test plan links to their acceptance criteria.');
      requirements = JSON.parse(req.content) as Requirements;
      inputs.push({ label: 'Requirements with the acceptance criterion ids to link (JSON)', json: req.content });
    }
    const built = buildPrompt({ stage: kind, stack: project.stack, facts: [`Project: ${project.title}`], inputs, extraPrompt });
    const raw = await this.#call(kind, built);
    const content =
      kind === 'requirements'
        ? withCitations(this.#parse(raw, parseRequirements), raw.citations)
        : kind === 'architecture'
          ? withCitations(this.#parse(raw, parseArchitecture), raw.citations)
          : kind === 'scaffold'
            ? withCitations(this.#parse(raw, parseScaffold), raw.citations)
            : withCitations(
              this.#parse(raw, (v) => {
                const plan = parseTestPlan(v);
                checkTestPlanLinks(plan, requirements!);
                return plan;
              }),
              raw.citations,
            );
    return this.#store.addArtifact({
      projectId: project.id,
      kind,
      content: JSON.stringify(content),
      prompt: extraPrompt?.trim() || null,
      tier: raw.tier,
    });
  }
}

/** Citations come only from the router, never from the model's own text. */
const withCitations = <T extends object>(value: T, citations: Citation[]): T =>
  citations.length ? { ...value, citations } : value;
