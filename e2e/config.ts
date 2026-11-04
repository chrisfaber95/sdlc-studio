/** Shared by the Playwright config, the stub backend and the specs. Not a secret: the backend only lives for the run. */
export const OWNER_TOKEN = 'e2e-owner-token';
export const API_PORT = Number(process.env.E2E_API_PORT ?? 8210);
export const OWNER_PORT = Number(process.env.E2E_UI_PORT ?? 5273);
export const VISITOR_PORT = OWNER_PORT + 1;
export const VISITOR_URL = `http://127.0.0.1:${VISITOR_PORT}`;
