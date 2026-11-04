import { ConfigError, loadConfig } from './config.ts';
import { Store } from './db/store.ts';
import { buildApp } from './http/app.ts';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`Configuration error: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
if (process.env.ANTHROPIC_API_KEY) {
  console.warn('ANTHROPIC_API_KEY is set but ignored: this app only calls the homelab LLM router.');
}

const app = buildApp({ config, store: new Store(config.dbPath) });
await app.listen({ host: config.host, port: config.port });
console.log(`sdlc-studio listening on http://${config.host}:${config.port}`);
