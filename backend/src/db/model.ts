export const STACKS = ['typescript', 'python', 'go', 'rust', 'vue', 'angular'] as const;
export type Stack = (typeof STACKS)[number];

export const STAGES = ['ideate', 'spec', 'design', 'build', 'ship', 'retro'] as const;
export type Stage = (typeof STAGES)[number];

export const ARTIFACT_KINDS = ['idea', 'requirements', 'architecture', 'test_plan', 'scaffold'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const TIERS = ['local', 'claude'] as const;
export type Tier = (typeof TIERS)[number];

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
  content: string;
  /** The owner's extra prompt, if one steered this version. */
  prompt: string | null;
  /** Which router tier produced this version. */
  tier: Tier;
  createdAt: string;
}

export const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
