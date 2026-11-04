import { defineConfig } from '@playwright/test';
import { API_PORT, OWNER_PORT, OWNER_TOKEN, VISITOR_PORT } from './config.ts';

const ui = (port: number, auth?: string) => ({
  command: `npm run dev -w frontend -- --port ${port} --strictPort`,
  cwd: '..',
  url: `http://127.0.0.1:${port}/`,
  env: { SDLC_API_URL: `http://127.0.0.1:${API_PORT}`, ...(auth && { SDLC_API_AUTH: auth }) },
  reuseExistingServer: false,
});

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${OWNER_PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', testMatch: 'studio.spec.ts', use: { browserName: 'chromium' } },
    // Only run on request (npm run screenshots): it rewrites docs/screenshots.
    { name: 'screenshots', testMatch: 'screenshots.spec.ts', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      // The real backend with an in-memory database and a stubbed router.
      command: 'node e2e/stub-server.ts',
      cwd: '..',
      url: `http://127.0.0.1:${API_PORT}/api/me`,
      reuseExistingServer: false,
    },
    ui(OWNER_PORT, `Bearer ${OWNER_TOKEN}`),
    ui(VISITOR_PORT),
  ],
});
