import type { Artifact, ArtifactKind, Project } from '../db/model.ts';
import type { Store } from '../db/store.ts';
import type { Architecture, Idea, Requirements, Scaffold, TestPlan } from './artifact-schemas.ts';
import { zip } from './zip.ts';
import type { ZipEntry } from './zip.ts';

const parse = <T>(a: Artifact): T => JSON.parse(a.content) as T;

const ideaMd = (i: Idea): string =>
  `# ${i.title}\n\n${i.summary}\n\n- Effort: ${i.effort} (about ${i.estimateHours} h)\n- Novelty: ${i.noveltyScore}/10\n- Skills: ${i.skillTags.join(', ')}\n`;

const requirementsMd = (r: Requirements): string =>
  '# Requirements\n\n' +
  r.userStories
    .map(
      (s) =>
        `## ${s.id}: As ${s.role}, I want ${s.want}, so that ${s.benefit}\n\nAcceptance criteria:\n` +
        s.acceptanceCriteria.map((c) => `- **${c.id}** ${c.text}`).join('\n') +
        '\n',
    )
    .join('\n');

const architectureMd = (a: Architecture): string =>
  `# Architecture\n\n${a.overview}\n\n## Components\n` +
  a.components.map((c) => `- **${c.name}**${c.technology ? ` (${c.technology})` : ''}: ${c.responsibility}`).join('\n') +
  '\n\n## Data model\n' +
  a.dataModel
    .map(
      (e) =>
        `### ${e.entity}\n` + e.fields.map((f) => `- ${f.name}: ${f.type}`).join('\n') + (e.relations?.length ? `\n\nRelations: ${e.relations.join('; ')}` : ''),
    )
    .join('\n\n') +
  '\n\n## Decision records\n' +
  a.decisions.map((d) => `### ${d.id}: ${d.title}\n\n- Context: ${d.context}\n- Decision: ${d.decision}\n- Consequences: ${d.consequences}`).join('\n\n') +
  '\n\n## Diagrams\n' +
  a.diagrams.map((d, i) => `### ${d.title}\n\n\`\`\`mermaid\n${d.mermaid}\n\`\`\`\n\n(also in diagrams/${diagramFile(d.title, i)})`).join('\n\n') +
  '\n';

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
const diagramFile = (title: string, i: number): string => `${String(i + 1).padStart(2, '0')}-${slug(title)}.mmd`;

const testPlanMd = (t: TestPlan): string =>
  `# Test plan\n\n${t.strategy}\n\nCI workflow: \`${t.ciWorkflow.path}\`\n\n## Test cases\n` +
  t.testCases
    .map(
      (c) =>
        `### ${c.id}: ${c.title}\n\n- Type: ${c.type}\n- Checks: ${c.acceptanceCriteria.join(', ')}\n- Steps:\n` +
        c.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n') +
        `\n- Expected: ${c.expected}`,
    )
    .join('\n\n') +
  '\n';

export interface ProjectZip {
  filename: string;
  data: Buffer;
}

export const projectSlug = (project: Project): string => slug(project.title);

/** The files of the project (ZIP and git repository alike), with paths relative to the project root. */
export function buildProjectFiles(store: Store, project: Project): ZipEntry[] {
  const latest = (kind: ArtifactKind) => store.latestArtifact(project.id, kind);
  const entries: ZipEntry[] = [];
  const manifest: Record<string, { version: number; tier: string; prompt: string | null; createdAt: string }> = {};
  const note = (a: Artifact) => (manifest[a.kind] = { version: a.version, tier: a.tier, prompt: a.prompt, createdAt: a.createdAt });
  const add = (path: string, content: string) => entries.push({ path, content });

  const idea = latest('idea');
  if (idea) {
    note(idea);
    add('docs/idea.md', ideaMd(parse<Idea>(idea)));
  }
  const req = latest('requirements');
  if (req) {
    note(req);
    add('docs/requirements.md', requirementsMd(parse<Requirements>(req)));
  }
  const arch = latest('architecture');
  if (arch) {
    note(arch);
    const a = parse<Architecture>(arch);
    add('docs/architecture.md', architectureMd(a));
    a.diagrams.forEach((d, i) => add(`docs/diagrams/${diagramFile(d.title, i)}`, d.mermaid + '\n'));
  }
  const plan = latest('test_plan');
  if (plan) {
    note(plan);
    const t = parse<TestPlan>(plan);
    add('docs/test-plan.md', testPlanMd(t));
    add(t.ciWorkflow.path, t.ciWorkflow.content);
  }
  const scaffold = latest('scaffold');
  if (scaffold) {
    note(scaffold);
    const sc = parse<Scaffold>(scaffold);
    for (const f of sc.files) add(f.path, f.content);
  }
  add('artifacts.json', JSON.stringify({ project: { id: project.id, title: project.title, stack: project.stack, stage: project.stage }, artifacts: manifest }, null, 2) + '\n');
  return entries;
}

/**
 * One ZIP with the latest version of every stored artifact of the project: docs/ for the spec, architecture
 * (with each diagram as a .mmd file) and test plan, the CI workflow at its own path, the scaffold files at the
 * root, and artifacts.json listing the version and tier of each. Missing stages are simply left out.
 */
export function buildProjectZip(store: Store, project: Project): ProjectZip {
  const root = projectSlug(project);
  const entries = buildProjectFiles(store, project).map((e) => ({ ...e, path: `${root}/${e.path}` }));
  return { filename: `${root}.zip`, data: zip(entries) };
}
