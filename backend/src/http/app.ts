import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import { ARTIFACT_KINDS, isOneOf, STACKS, STAGES, TIERS } from '../db/model.ts';
import type { Project } from '../db/model.ts';
import type { Store } from '../db/store.ts';
import { Pipeline, PipelineError, GENERATED_KINDS } from '../pipeline/service.ts';
import { EFFORTS, SchemaError } from '../pipeline/artifact-schemas.ts';
import { STAGE_TIERS } from '../router/prompts.ts';
import type { RouterClient } from '../router/types.ts';
import { buildProjectZip } from '../pipeline/export.ts';
import { registerRoles } from './roles.ts';

export function buildApp(deps: { config: Config; store: Store; router: RouterClient }): FastifyInstance {
  const { config, store, router } = deps;
  const pipeline = new Pipeline(store, router);
  const app = Fastify({ logger: false });
  registerRoles(app, config);
  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof PipelineError) return reply.code(err.status).send({ error: err.code, message: err.message });
    if (err instanceof SchemaError) return reply.code(400).send({ error: 'bad_request', message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'bad_request', message: (err as Error).message });
    return reply.code(500).send({ error: 'internal', message: 'Internal error' });
  });

  // Visitors only ever see example projects; everything else answers 404 so its existence is not leaked.
  const visible = (req: FastifyRequest, reply: FastifyReply, id: unknown): Project | undefined => {
    const project = store.getProject(Number(id));
    if (!project || (req.role !== 'owner' && !project.isExample)) {
      void reply.code(404).send({ error: 'not_found' });
      return undefined;
    }
    return project;
  };
  const bad = (reply: FastifyReply, message: string) => reply.code(400).send({ error: 'bad_request', message });

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/me', async (req) => ({ role: req.role, identity: req.identity }));

  app.get('/api/projects', async (req) => store.listProjects({ examplesOnly: req.role !== 'owner' }));

  app.get('/api/projects/:id', async (req, reply) => visible(req, reply, (req.params as { id: string }).id));

  app.get('/api/projects/:id/artifacts', async (req, reply) => {
    const project = visible(req, reply, (req.params as { id: string }).id);
    if (!project) return;
    const { kind } = req.query as { kind?: string };
    if (kind !== undefined && !isOneOf(ARTIFACT_KINDS, kind)) return bad(reply, 'unknown artifact kind');
    return store.listArtifacts(project.id, kind);
  });

  const extraPrompt = (reply: FastifyReply, v: unknown): { ok: true; value: string | undefined } | { ok: false } => {
    if (v === undefined || v === null) return { ok: true, value: undefined };
    if (typeof v !== 'string' || v.length > 4000) {
      bad(reply, 'prompt must be a string of at most 4000 characters');
      return { ok: false };
    }
    return { ok: true, value: v.trim() || undefined };
  };

  // 1. Ideas for a stack, topic and effort. Nothing is stored until the owner chooses one.
  app.post('/api/ideas', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isOneOf(STACKS, b.stack)) return bad(reply, `stack must be one of ${STACKS.join(', ')}`);
    if (typeof b.topic !== 'string' || !b.topic.trim() || b.topic.length > 500) return bad(reply, 'topic is required');
    if (!isOneOf(EFFORTS, b.effort)) return bad(reply, `effort must be one of ${EFFORTS.join(', ')}`);
    const p = extraPrompt(reply, b.prompt);
    if (!p.ok) return;
    return pipeline.generateIdeas({ stack: b.stack, topic: b.topic.trim(), effort: b.effort, prompt: p.value });
  });

  // 2. Choosing an idea creates a project in stage "ideate".
  app.post('/api/projects/from-idea', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isOneOf(STACKS, b.stack)) return bad(reply, `stack must be one of ${STACKS.join(', ')}`);
    if (b.tier !== undefined && !isOneOf(TIERS, b.tier)) return bad(reply, `tier must be one of ${TIERS.join(', ')}`);
    const p = extraPrompt(reply, b.prompt);
    if (!p.ok) return;
    const res = pipeline.chooseIdea({ stack: b.stack, idea: b.idea, tier: b.tier ?? STAGE_TIERS.idea, prompt: p.value ?? null });
    return reply.code(201).send(res);
  });

  // 3-6. Generate (or regenerate, as a new version) requirements, architecture or test plan.
  app.post('/api/projects/:id/generate/:kind', async (req, reply) => {
    const project = visible(req, reply, (req.params as { id: string }).id);
    if (!project) return;
    const { kind } = req.params as { kind: string };
    if (!isOneOf(GENERATED_KINDS, kind)) return bad(reply, `kind must be one of ${GENERATED_KINDS.join(', ')}`);
    const p = extraPrompt(reply, ((req.body ?? {}) as Record<string, unknown>).prompt);
    if (!p.ok) return;
    return reply.code(201).send(await pipeline.generate(project, kind, p.value));
  });

  app.get('/api/projects/:id/artifacts/:kind/:version', async (req, reply) => {
    const project = visible(req, reply, (req.params as { id: string }).id);
    if (!project) return;
    const { kind, version } = req.params as { kind: string; version: string };
    if (!isOneOf(ARTIFACT_KINDS, kind)) return bad(reply, 'unknown artifact kind');
    const artifact = store.listArtifacts(project.id, kind).find((a) => a.version === Number(version));
    return artifact ?? reply.code(404).send({ error: 'not_found' });
  });

  // One ZIP with the latest version of every artifact. A GET, so visitors may download example projects.
  app.get('/api/projects/:id/download', async (req, reply) => {
    const project = visible(req, reply, (req.params as { id: string }).id);
    if (!project) return;
    const { filename, data } = buildProjectZip(store, project);
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(data);
  });

  app.post('/api/projects', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 200) return bad(reply, 'title is required');
    if (!isOneOf(STACKS, b.stack)) return bad(reply, `stack must be one of ${STACKS.join(', ')}`);
    const project = store.createProject({ title: b.title.trim(), stack: b.stack, isExample: b.isExample === true });
    return reply.code(201).send(project);
  });

  app.patch('/api/projects/:id', async (req, reply) => {
    const project = visible(req, reply, (req.params as { id: string }).id);
    if (!project) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (b.stage !== undefined && !isOneOf(STAGES, b.stage)) return bad(reply, `stage must be one of ${STAGES.join(', ')}`);
    if (b.title !== undefined && (typeof b.title !== 'string' || !b.title.trim())) return bad(reply, 'invalid title');
    if (b.isExample !== undefined && typeof b.isExample !== 'boolean') return bad(reply, 'invalid isExample');
    return store.updateProject(project.id, {
      ...(b.stage !== undefined && { stage: b.stage as (typeof STAGES)[number] }),
      ...(b.title !== undefined && { title: (b.title as string).trim() }),
      ...(b.isExample !== undefined && { isExample: b.isExample as boolean }),
    });
  });

  return app;
}
