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
} as const;

export type PromptStage = keyof typeof SHAPES;

const ROLES: Record<PromptStage, string> = {
  idea: 'You propose small, useful software project ideas that help a developer practise chosen skills.',
  requirements: 'You are a business analyst writing user stories with testable acceptance criteria for a small project.',
  architecture: 'You are a software architect designing a small project from its requirements.',
  test_plan: 'You are a test lead planning tests and a CI workflow for a small project.',
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
