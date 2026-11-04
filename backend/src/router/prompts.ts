import type { ArtifactKind, Stack, Tier } from '../db/model.ts';

/**
 * Everything about how a stage talks to the router, in one module (see the `router-prompts` skill):
 * the tier per stage, the prompt recipes and the citation rules.
 */

/** Tier per stage: the one place to change it. Proposal from the router-prompts skill, to confirm with Chris. */
export const STAGE_TIERS: Readonly<Record<ArtifactKind, Tier>> = {
  idea: 'local',
  requirements: 'local',
  architecture: 'claude',
  test_plan: 'claude',
  scaffold: 'claude',
};

export const tierFor = (stage: ArtifactKind): Tier => STAGE_TIERS[stage];

/**
 * Citation rules: the model is told not to cite anything. Citations only exist when the router returns them
 * (for example from retrieved material); the pipeline stores those with the artifact and never invents any.
 */
export const CITATION_RULE =
  'Do not cite sources and do not include a "citations" field. Never invent references or URLs.';

const COMMON =
  'Reply with one JSON object only: no Markdown, no code fence, no commentary. Use exactly the field names shown. ' +
  CITATION_RULE;

const SHAPES = {
  idea:
    '{"ideas": [{"title": string, "summary": string, "effort": "small"|"medium"|"large", "estimateHours": number, ' +
    '"noveltyScore": number 1-10, "skillTags": [string]}]}  (at least 3 ideas)',
  requirements:
    '{"userStories": [{"id": "US-1", "role": string, "want": string, "benefit": string, "acceptanceCriteria": ' +
    '[{"id": "AC-1.1", "text": string}]}]}  (each story needs at least one testable acceptance criterion; ids are unique)',
  architecture:
    '{"overview": string, "components": [{"name": string, "responsibility": string, "technology": string?}], ' +
    '"dataModel": [{"entity": string, "fields": [{"name": string, "type": string}], "relations": [string]?}], ' +
    '"decisions": [{"id": "ADR-1", "title": string, "context": string, "decision": string, "consequences": string}], ' +
    '"diagrams": [{"title": string, "mermaid": "Mermaid source such as flowchart TD ..."}]}  ' +
    '(at least one component, entity, decision record and diagram)',
  test_plan:
    '{"strategy": string, "testCases": [{"id": "TC-1", "title": string, "type": "unit"|"integration"|"e2e", ' +
    '"steps": [string], "expected": string, "acceptanceCriteria": ["AC-1.1"]}], ' +
    '"ciWorkflow": {"path": ".github/workflows/ci.yml", "content": "GitHub Actions YAML with on: and jobs:"}}  ' +
    '(every test case links to acceptance criterion ids taken from the requirements)',
  scaffold:
    '{"summary": string, "files": [{"path": string, "content": string}]}  (relative paths with forward slashes; ' +
    'never under docs/ or .github/workflows/, those are added from the other stages)',
} as const;

export type PromptStage = keyof typeof SHAPES;

const ROLES: Record<PromptStage, string> = {
  idea: 'You propose small, useful software project ideas that help a developer practise chosen skills.',
  requirements: 'You are a business analyst writing user stories with testable acceptance criteria for a small project.',
  architecture: 'You are a software architect designing a small project from its requirements.',
  test_plan: 'You are a test lead planning tests and a CI workflow for a small project.',
  scaffold:
    'You are a senior engineer creating the starting code of a small project from its requirements, architecture and test plan. ' +
    'Scaffold depth: hello world plus the project structure, build and test configuration, a .gitignore, a README with ' +
    'the run and test commands, and one passing placeholder test. Keep it small and runnable; no business logic.',
};

/** What a scaffold must contain per stack; also enforced by the validator in `artifact-schemas.ts`. */
export const SCAFFOLD_HINTS: Record<Stack, string> = {
  typescript: 'Node + TypeScript: package.json (with build and test scripts), tsconfig.json, src/index.ts, one test file.',
  python: 'Python 3: pyproject.toml, a package under src/, one pytest test file under tests/.',
  go: 'Go modules: go.mod, main.go, one *_test.go file.',
  rust: 'Cargo: Cargo.toml, src/main.rs, one #[test] (in a tests/ file or in the source).',
  vue: 'Vue 3 + Vite + TypeScript: package.json, vite.config.ts, index.html, src/main.ts, src/App.vue, one Vitest test.',
  angular: 'Angular (standalone components): package.json, angular.json, tsconfig.json, src/main.ts, an app component, one *.spec.ts test.',
};

export interface PromptInput {
  stage: PromptStage;
  stack: Stack;
  /** Stage-specific lines (topic and effort for ideas). */
  facts?: string[];
  /** Earlier artifacts the stage is built from, as JSON text, in the order they are shown. */
  inputs?: { label: string; json: string }[];
  /** The owner's extra instruction. Appended last, so it can steer the result. */
  extraPrompt?: string | undefined;
}

export const OWNER_PROMPT_LABEL = "Extra instruction from the owner (apply it, it overrides defaults where they conflict):";

export function buildPrompt(input: PromptInput): { system: string; prompt: string } {
  const system = `${ROLES[input.stage]}\n${COMMON}\nOutput shape: ${SHAPES[input.stage]}`;
  const parts = [`Stack: ${input.stack}`, ...(input.facts ?? [])];
  for (const i of input.inputs ?? []) parts.push(`${i.label}:\n${i.json}`);
  if (input.extraPrompt?.trim()) parts.push(`${OWNER_PROMPT_LABEL}\n${input.extraPrompt.trim()}`);
  return { system, prompt: parts.join('\n\n') };
}
