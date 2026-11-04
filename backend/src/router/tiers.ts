import type { ArtifactKind, Tier } from '../db/model.ts';

/** Tier per stage: the one place to change it. Proposal from the router-prompts skill, to confirm with Chris. */
export const STAGE_TIERS: Readonly<Record<ArtifactKind, Tier>> = {
  idea: 'local',
  requirements: 'local',
  architecture: 'claude',
  test_plan: 'claude',
  scaffold: 'claude',
};
