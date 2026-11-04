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
    scaffold: { files: [{ path: 'README.md', content: `# Habits${tag}` }, { path: 'src/index.ts', content: 'export {};' }] },
  }[req.stage];
  return { content: JSON.stringify(body) };
}
