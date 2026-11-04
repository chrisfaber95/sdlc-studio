import vue from '@vitejs/plugin-vue';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// SDLC_API_URL / SDLC_API_AUTH are for the browser tests (e2e/): they point the proxy at a stub backend and let it
// authenticate as the owner, the way Tailscale Serve would.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'SDLC_');
  return {
    plugins: [vue()],
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: env.SDLC_API_URL ?? 'http://127.0.0.1:8110',
          ...(env.SDLC_API_AUTH && { headers: { Authorization: env.SDLC_API_AUTH } }),
        },
      },
    },
    test: { environment: 'jsdom' },
  };
});
