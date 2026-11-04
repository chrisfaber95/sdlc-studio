import { fileURLToPath } from 'node:url';

export interface Config {
  host: string;
  port: number;
  routerBaseUrl: string;
  routerToken: string;
  /** Tailscale login names (for example "chris@example.com") that count as owner. */
  ownerIdentities: string[];
  /** Shared secret for owner access without Tailscale identity headers (CLI, skill, tests). */
  ownerToken: string;
  dbPath: string;
  /** The built Vue app (frontend/dist), served next to the API. Empty: API only. */
  staticDir: string;
}

/** frontend/dist, seen from backend/src or backend/dist (both are two levels below the repo root). */
const DEFAULT_STATIC_DIR = fileURLToPath(new URL('../../frontend/dist', import.meta.url));

const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]', '0:0:0:0:0:0:0:0']);

export class ConfigError extends Error {}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Reads configuration from environment variables. There is deliberately no Claude API key setting:
 * all generation goes through the homelab LLM router (H-012).
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const host = (env.SDLC_HOST ?? '127.0.0.1').trim();
  if (WILDCARD_HOSTS.has(host) && env.SDLC_ALLOW_WILDCARD_BIND !== '1') {
    throw new ConfigError(
      `SDLC_HOST=${host} binds every interface. Use 127.0.0.1 or the Tailscale address, ` +
        'or set SDLC_ALLOW_WILDCARD_BIND=1 if a firewall guarantees the app is not reachable from the internet.',
    );
  }
  const port = Number(env.SDLC_PORT ?? '8111');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`SDLC_PORT must be a port number, got "${env.SDLC_PORT}"`);
  }
  return {
    host,
    port,
    routerBaseUrl: (env.SDLC_ROUTER_URL ?? 'http://127.0.0.1:8018').replace(/\/+$/, ''),
    routerToken: env.SDLC_ROUTER_TOKEN ?? '',
    ownerIdentities: list(env.SDLC_OWNER_IDENTITIES),
    ownerToken: env.SDLC_OWNER_TOKEN ?? '',
    dbPath: env.SDLC_DB_PATH ?? './data/sdlc-studio.db',
    staticDir: (env.SDLC_STATIC_DIR ?? DEFAULT_STATIC_DIR).trim(),
  };
}
