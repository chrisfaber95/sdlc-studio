import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';

export type Role = 'owner' | 'visitor';

declare module 'fastify' {
  interface FastifyRequest {
    role: Role;
    identity: string | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const isLoopback = (addr: string | undefined): boolean =>
  addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Owner if the request carries a valid owner token, or an identity header from Tailscale Serve naming
 * a configured owner. Identity headers are only trusted from a loopback peer (Tailscale Serve proxies
 * from 127.0.0.1); a direct tailnet connection could forge them. Everyone else is a visitor.
 */
export function identify(req: FastifyRequest, config: Config): { role: Role; identity: string | null } {
  const auth = req.headers.authorization;
  if (config.ownerToken && auth?.startsWith('Bearer ') && tokenMatches(auth.slice(7), config.ownerToken)) {
    return { role: 'owner', identity: 'owner-token' };
  }
  const login = req.headers['tailscale-user-login'];
  if (typeof login === 'string' && isLoopback(req.socket.remoteAddress)) {
    const id = login.trim().toLowerCase();
    if (config.ownerIdentities.includes(id)) return { role: 'owner', identity: id };
    return { role: 'visitor', identity: id };
  }
  return { role: 'visitor', identity: null };
}

/** Server-side enforcement: a non-owner can never run a state-changing method, whatever the route. */
export function registerRoles(app: FastifyInstance, config: Config): void {
  app.decorateRequest('role', 'visitor');
  app.decorateRequest('identity', null);
  app.addHook('onRequest', async (req, reply) => {
    const { role, identity } = identify(req, config);
    req.role = role;
    req.identity = identity;
    if (role !== 'owner' && !SAFE_METHODS.has(req.method)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Read-only access: only the owner can change anything.' });
    }
  });
}
