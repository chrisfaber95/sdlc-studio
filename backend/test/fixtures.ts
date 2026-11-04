import { OWNER_PROMPT_LABEL } from '../src/router/prompts.ts';
import type { GenerateRequest } from '../src/router/types.ts';

export const idea = (title: string) => ({
  title,
  summary: `${title} summary`,
  effort: 'small',
  estimateHours: 8,
  noveltyScore: 6,
  skillTags: ['fastify', 'sqlite'],
});

/** The extra instruction the owner gave, as the router saw it (empty when none). */
const steer = (req: GenerateRequest): string => req.prompt.split(OWNER_PROMPT_LABEL)[1]?.trim() ?? '';

const stackOf = (req: GenerateRequest): string => /^Stack: (\w+)/m.exec(req.prompt)?.[1] ?? '';

/** The smallest valid scaffold per stack: manifest, a source file and a placeholder test. */
export const SCAFFOLD_FILES: Record<string, Record<string, string>> = {
  typescript: { 'package.json': '{"scripts":{"test":"vitest run"}}', 'tsconfig.json': '{}', 'src/index.ts': 'console.log("hello");', 'src/index.test.ts': 'test("ok",()=>{});' },
  python: { 'pyproject.toml': '[project]\nname="x"', 'src/x/__init__.py': 'def hello(): return "hi"', 'tests/test_x.py': 'def test_ok(): assert True' },
  go: { 'go.mod': 'module x', 'main.go': 'package main\nfunc main() {}', 'main_test.go': 'package main' },
  rust: { 'Cargo.toml': '[package]\nname="x"', 'src/main.rs': 'fn main() {}', 'tests/smoke.rs': '#[test]\nfn ok() {}' },
  vue: { 'package.json': '{}', 'src/main.ts': '// entry', 'src/App.vue': '<template/>', 'src/App.test.ts': '// test' },
  angular: { 'angular.json': '{}', 'package.json': '{}', 'src/main.ts': '// entry', 'src/app/app.spec.ts': '// spec' },
};

function scaffoldFor(req: GenerateRequest, tag: string) {
  const files = SCAFFOLD_FILES[stackOf(req)] ?? {};
  return { summary: `Scaffold${tag}`, files: Object.entries(files).map(([path, content]) => ({ path, content: content + tag })) };
}

/** A stub reply that is valid for every stage and reflects the owner's extra prompt in its text. */
export function validReply(req: GenerateRequest): { content: string } {
  const s = steer(req);
  const tag = s ? ` [${s}]` : '';
  const body = {
    idea: { ideas: [idea(`One${tag}`), idea('Two'), idea('Three')] },
    requirements: {
      userStories: [
        {
          id: 'US-1',
          role: 'owner',
          want: `to track habits${tag}`,
          benefit: 'I stay consistent',
          acceptanceCriteria: [
            { id: 'AC-1.1', text: 'A habit can be added' },
            { id: 'AC-1.2', text: 'A habit can be removed' },
          ],
        },
      ],
    },
    architecture: {
      overview: `Small API${tag}`,
      components: [{ name: 'API', responsibility: 'serves habits', technology: 'Fastify' }],
      dataModel: [{ entity: 'Habit', fields: [{ name: 'id', type: 'integer' }], relations: [] }],
      decisions: [{ id: 'ADR-1', title: 'SQLite', context: 'c', decision: 'use it', consequences: 'simple' }],
      diagrams: [{ title: 'Overview', mermaid: 'flowchart TD\n  A[Client] --> B[API]' }],
    },
    test_plan: {
      strategy: `Pyramid${tag}`,
      testCases: [
        { id: 'TC-1', title: 'add habit', type: 'integration', steps: ['POST /habits'], expected: '201', acceptanceCriteria: ['AC-1.1'] },
      ],
      ciWorkflow: { path: '.github/workflows/ci.yml', content: 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n' },
    },
    scaffold: scaffoldFor(req, tag),
  }[req.stage];
  return { content: JSON.stringify(body) };
}
