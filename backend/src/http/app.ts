import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import { ARTIFACT_KINDS, isOneOf, STACKS, STAGES } from '../db/model.ts';
import type { Project } from '../db/model.ts';
import type { Store } from '../db/store.ts';
import { registerRoles } from './roles.ts';

export function buildApp(deps: { config: Config; store: Store }): FastifyInstance {
  const { config, store } = deps;
  const app = Fastify({ logger: false });
  registerRoles(app, config);

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
