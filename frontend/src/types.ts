export const STACKS = ['typescript', 'python', 'go', 'rust', 'vue', 'angular'] as const;
export type Stack = (typeof STACKS)[number];
export const EFFORTS = ['small', 'medium', 'large'] as const;
export type Effort = (typeof EFFORTS)[number];
export const STAGES = ['ideate', 'spec', 'design', 'build', 'ship', 'retro'] as const;
export type Stage = (typeof STAGES)[number];
export type ArtifactKind = 'idea' | 'requirements' | 'architecture' | 'test_plan' | 'scaffold';
export type GeneratedKind = Exclude<ArtifactKind, 'idea'>;
export type Tier = 'local' | 'claude';

export interface Me {
  role: 'owner' | 'visitor';
  identity: string | null;
}
export interface Project {
  id: number;
  title: string;
  stack: Stack;
  stage: Stage;
  isExample: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Artifact {
  id: number;
  projectId: number;
  kind: ArtifactKind;
  version: number;
  /** JSON text, shaped like the types below. */
  content: string;
  prompt: string | null;
  tier: Tier;
  createdAt: string;
}

export interface Idea {
  title: string;
  summary: string;
  effort: Effort;
  estimateHours: number;
  noveltyScore: number;
  skillTags: string[];
}
export interface Requirements {
  userStories: {
    id: string;
    role: string;
    want: string;
    benefit: string;
    acceptanceCriteria: { id: string; text: string }[];
  }[];
}
export interface Architecture {
  overview: string;
  components: { name: string; responsibility: string; technology?: string }[];
  dataModel: { entity: string; fields: { name: string; type: string }[]; relations?: string[] }[];
  decisions: { id: string; title: string; context: string; decision: string; consequences: string }[];
  diagrams: { title: string; mermaid: string }[];
}
export interface TestPlan {
  strategy: string;
  testCases: {
    id: string;
    title: string;
    type: string;
    steps: string[];
    expected: string;
    acceptanceCriteria: string[];
  }[];
  ciWorkflow: { path: string; content: string };
}
export interface Scaffold {
  summary: string;
  files: { path: string; content: string }[];
}

export const STAGE_LABELS: Record<Stage, string> = {
  ideate: 'Ideate',
  spec: 'Spec',
  design: 'Design',
  build: 'Build',
  ship: 'Ship',
  retro: 'Retro',
};
export const KIND_LABELS: Record<ArtifactKind, string> = {
  idea: 'Idea',
  requirements: 'Requirements',
  architecture: 'Architecture',
  test_plan: 'Test plan',
  scaffold: 'Scaffold',
};
