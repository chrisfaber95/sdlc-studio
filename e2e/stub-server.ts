// Backend for the browser tests: the real app and an in-memory database, with the router replaced by a stub.
// Seeds one finished example project and one private project so the visitor checks have something to browse (and not to see).
import { loadConfig } from '../backend/src/config.ts';
import { Store } from '../backend/src/db/store.ts';
import { buildApp } from '../backend/src/http/app.ts';
import { StubRouterClient } from '../backend/src/router/stub.ts';
import { API_PORT, OWNER_TOKEN } from './config.ts';
import { validReply } from '../backend/test/fixtures.ts';


const store = new Store(':memory:');
store.createProject({ title: 'Private draft', stack: 'go' });

const app = buildApp({ config: loadConfig({ SDLC_OWNER_TOKEN: OWNER_TOKEN }), store, router: new StubRouterClient(validReply) });

// A complete example: every stage generated through the real pipeline (stubbed router), then marked as an example.
const owner = { authorization: `Bearer ${OWNER_TOKEN}` };
const post = async (url: string, payload: object) => {
  const res = await app.inject({ method: 'POST', url, headers: owner, payload });
  if (res.statusCode >= 300) throw new Error(`seed ${url}: ${res.statusCode} ${res.body}`);
  return res.json();
};
const { ideas } = await post('/api/ideas', { stack: 'typescript', topic: 'habits', effort: 'small' });
const { project } = await post('/api/projects/from-idea', { stack: 'typescript', idea: ideas[0] });
for (const kind of ['requirements', 'architecture', 'test_plan', 'scaffold']) await post(`/api/projects/${project.id}/generate/${kind}`, {});
store.updateProject(project.id, { title: 'Habit tracker (example)', stage: 'ship', isExample: true });

await app.listen({ host: '127.0.0.1', port: API_PORT });
