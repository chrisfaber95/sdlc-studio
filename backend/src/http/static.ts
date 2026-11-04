import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves the built Vue app (frontend/dist) on every GET outside /api, so one process is the whole app.
 * Unknown paths get index.html; /api paths are never answered here. Does nothing when the folder has no
 * index.html (API-only, as in development with the Vite dev server).
 */
export function registerStatic(app: FastifyInstance, dir: string): boolean {
  if (!dir || !existsSync(join(dir, 'index.html'))) return false;
  const root = normalize(dir + sep);

  app.setNotFoundHandler(async (req, reply) => {
    const path = decodeURIComponent((req.url.split('?')[0] ?? '/'));
    if ((req.method !== 'GET' && req.method !== 'HEAD') || path === '/api' || path.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not_found' });
    }
    let file = normalize(join(root, path));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) file = join(root, 'index.html');
    const hashed = file.startsWith(join(root, 'assets') + sep);
    return reply
      .header('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
      .header('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
      .send(await readFile(file));
  });
  return true;
}
