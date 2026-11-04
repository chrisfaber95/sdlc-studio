import type { Citation } from '../router/types.ts';

/**
 * The shape of every generated artifact, in one place (see the `artifact-schemas` skill). Router output is
 * parsed with these functions before anything is stored. Each parser rebuilds the object from known fields, so
 * unknown keys (including any "citations" the model made up) are dropped; citations only come from the router.
 */

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

export const EFFORTS = ['small', 'medium', 'large'] as const;
export type Effort = (typeof EFFORTS)[number];

export const TEST_TYPES = ['unit', 'integration', 'e2e'] as const;
export type TestType = (typeof TEST_TYPES)[number];

export interface Idea {
  title: string;
  summary: string;
  effort: Effort;
  /** Rough size in hours. */
  estimateHours: number;
  /** 1 (common) to 10 (very novel). */
  noveltyScore: number;
  skillTags: string[];
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
}
export interface UserStory {
  id: string;
  role: string;
  want: string;
  benefit: string;
  acceptanceCriteria: AcceptanceCriterion[];
}
export interface Requirements {
  userStories: UserStory[];
  citations?: Citation[];
}

export interface Architecture {
  overview: string;
  components: { name: string; responsibility: string; technology?: string }[];
  dataModel: { entity: string; fields: { name: string; type: string }[]; relations?: string[] }[];
  decisions: { id: string; title: string; context: string; decision: string; consequences: string }[];
  /** Mermaid source text, rendered by the frontend. */
  diagrams: { title: string; mermaid: string }[];
  citations?: Citation[];
}

export interface TestCase {
  id: string;
  title: string;
  type: TestType;
  steps: string[];
  expected: string;
  /** Ids of the acceptance criteria this case checks. */
  acceptanceCriteria: string[];
}
export interface TestPlan {
  strategy: string;
  testCases: TestCase[];
  ciWorkflow: { path: string; content: string };
  citations?: Citation[];
}

export interface Scaffold {
  files: { path: string; content: string }[];
  citations?: Citation[];
}

type Obj = Record<string, unknown>;

const fail = (path: string, msg: string): never => {
  throw new SchemaError(`${path}: ${msg}`);
};

const object = (v: unknown, path: string): Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(path, 'expected an object');

function text(v: unknown, path: string, max = 4000): string {
  if (typeof v !== 'string' || !v.trim()) return fail(path, 'expected a non-empty string');
  if (v.length > max) return fail(path, `longer than ${max} characters`);
  return v.trim();
}

function list<T>(v: unknown, path: string, min: number, item: (x: unknown, p: string) => T, max = 60): T[] {
  if (!Array.isArray(v)) return fail(path, 'expected an array');
  if (v.length < min) return fail(path, `needs at least ${min} item${min === 1 ? '' : 's'}`);
  if (v.length > max) return fail(path, `more than ${max} items`);
  return v.map((x, i) => item(x, `${path}[${i}]`));
}

const uniqueIds = (ids: string[], path: string): void => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(path, `duplicate id ${id}`);
    seen.add(id);
  }
};

/** Parses the router's text as JSON, tolerating a Markdown code fence around it. */
export function parseModelJson(content: string): unknown {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/.exec(content);
  try {
    return JSON.parse(fenced?.[1] ?? content);
  } catch {
    return fail('response', 'not valid JSON');
  }
}

export function parseIdea(v: unknown, path = 'idea'): Idea {
  const o = object(v, path);
  const effort = o.effort;
  if (!(EFFORTS as readonly unknown[]).includes(effort)) fail(`${path}.effort`, `must be one of ${EFFORTS.join(', ')}`);
  const hours = o.estimateHours;
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) fail(`${path}.estimateHours`, 'expected a positive number');
  const novelty = o.noveltyScore;
  if (typeof novelty !== 'number' || !Number.isFinite(novelty) || novelty < 1 || novelty > 10) {
    fail(`${path}.noveltyScore`, 'expected a number from 1 to 10');
  }
  return {
    title: text(o.title, `${path}.title`, 200),
    summary: text(o.summary, `${path}.summary`),
    effort: effort as Effort,
    estimateHours: hours as number,
    noveltyScore: novelty as number,
    skillTags: list(o.skillTags, `${path}.skillTags`, 1, (x, p) => text(x, p, 50), 12),
  };
}

export function parseIdeas(v: unknown): Idea[] {
  return list(object(v, 'response').ideas, 'ideas', 3, parseIdea, 10);
}

export function parseRequirements(v: unknown): Requirements {
  const o = object(v, 'requirements');
  const userStories = list(o.userStories, 'userStories', 1, (s, p) => {
    const so = object(s, p);
    return {
      id: text(so.id, `${p}.id`, 40),
      role: text(so.role, `${p}.role`, 200),
      want: text(so.want, `${p}.want`, 500),
      benefit: text(so.benefit, `${p}.benefit`, 500),
      acceptanceCriteria: list(so.acceptanceCriteria, `${p}.acceptanceCriteria`, 1, (c, cp) => {
        const co = object(c, cp);
        return { id: text(co.id, `${cp}.id`, 40), text: text(co.text, `${cp}.text`, 500) };
      }),
    };
  });
  uniqueIds(userStories.map((s) => s.id), 'userStories');
  uniqueIds(userStories.flatMap((s) => s.acceptanceCriteria.map((c) => c.id)), 'acceptanceCriteria');
  return { userStories };
}

const MERMAID_START =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|journey|mindmap|timeline|C4Context)\b/;

function mermaid(v: unknown, path: string): string {
  const fenced = /^\s*```(?:mermaid)?\s*\n([\s\S]*?)\n\s*```\s*$/.exec(typeof v === 'string' ? v : '');
  const src = text(fenced?.[1] ?? v, path, 8000);
  if (!MERMAID_START.test(src)) fail(path, 'not Mermaid text (must start with a diagram type such as "flowchart TD")');
  return src;
}

export function parseArchitecture(v: unknown): Architecture {
  const o = object(v, 'architecture');
  const decisions = list(o.decisions, 'decisions', 1, (d, p) => {
    const dobj = object(d, p);
    return {
      id: text(dobj.id, `${p}.id`, 40),
      title: text(dobj.title, `${p}.title`, 200),
      context: text(dobj.context, `${p}.context`),
      decision: text(dobj.decision, `${p}.decision`),
      consequences: text(dobj.consequences, `${p}.consequences`),
    };
  });
  uniqueIds(decisions.map((d) => d.id), 'decisions');
  return {
    overview: text(o.overview, 'overview'),
    components: list(o.components, 'components', 1, (c, p) => {
      const co = object(c, p);
      const technology = co.technology === undefined ? undefined : text(co.technology, `${p}.technology`, 200);
      return {
        name: text(co.name, `${p}.name`, 200),
        responsibility: text(co.responsibility, `${p}.responsibility`),
        ...(technology && { technology }),
      };
    }),
    dataModel: list(o.dataModel, 'dataModel', 1, (e, p) => {
      const eo = object(e, p);
      const relations =
        eo.relations === undefined ? undefined : list(eo.relations, `${p}.relations`, 0, (r, rp) => text(r, rp, 300));
      return {
        entity: text(eo.entity, `${p}.entity`, 200),
        fields: list(eo.fields, `${p}.fields`, 1, (f, fp) => {
          const fo = object(f, fp);
          return { name: text(fo.name, `${fp}.name`, 100), type: text(fo.type, `${fp}.type`, 100) };
        }),
        ...(relations && { relations }),
      };
    }),
    decisions,
    diagrams: list(o.diagrams, 'diagrams', 1, (d, p) => {
      const dobj = object(d, p);
      return { title: text(dobj.title, `${p}.title`, 200), mermaid: mermaid(dobj.mermaid, `${p}.mermaid`) };
    }, 10),
  };
}

export function parseTestPlan(v: unknown): TestPlan {
  const o = object(v, 'testPlan');
  const testCases = list(o.testCases, 'testCases', 1, (t, p) => {
    const to = object(t, p);
    const type = to.type;
    if (!(TEST_TYPES as readonly unknown[]).includes(type)) fail(`${p}.type`, `must be one of ${TEST_TYPES.join(', ')}`);
    return {
      id: text(to.id, `${p}.id`, 40),
      title: text(to.title, `${p}.title`, 300),
      type: type as TestType,
      steps: list(to.steps, `${p}.steps`, 1, (s, sp) => text(s, sp, 500), 30),
      expected: text(to.expected, `${p}.expected`, 1000),
      acceptanceCriteria: list(to.acceptanceCriteria, `${p}.acceptanceCriteria`, 1, (a, ap) => text(a, ap, 40)),
    };
  });
  uniqueIds(testCases.map((t) => t.id), 'testCases');
  const ci = object(o.ciWorkflow, 'ciWorkflow');
  const path = text(ci.path, 'ciWorkflow.path', 200);
  if (!/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(path)) fail('ciWorkflow.path', 'must be .github/workflows/<name>.yml');
  const content = text(ci.content, 'ciWorkflow.content', 20_000);
  if (!/^on:/m.test(content) || !/^jobs:/m.test(content)) fail('ciWorkflow.content', 'must be a workflow with "on:" and "jobs:"');
  return { strategy: text(o.strategy, 'strategy'), testCases, ciWorkflow: { path, content } };
}

/** Every test case must point at acceptance criteria that exist in the requirements it was built from. */
export function checkTestPlanLinks(plan: TestPlan, requirements: Requirements): void {
  const known = new Set(requirements.userStories.flatMap((s) => s.acceptanceCriteria.map((c) => c.id)));
  for (const tc of plan.testCases) {
    for (const id of tc.acceptanceCriteria) {
      if (!known.has(id)) fail(`testCases[${tc.id}].acceptanceCriteria`, `unknown acceptance criterion ${id}`);
    }
  }
}

export function parseScaffold(v: unknown): Scaffold {
  const files = list(object(v, 'scaffold').files, 'files', 1, (f, p) => {
    const fo = object(f, p);
    const path = text(fo.path, `${p}.path`, 300);
    if (path.startsWith('/') || path.includes('\\') || path.split('/').some((seg) => seg === '..' || seg === '')) {
      fail(`${p}.path`, 'must be a relative path inside the project');
    }
    if (typeof fo.content !== 'string') fail(`${p}.content`, 'expected a string');
    if ((fo.content as string).length > 50_000) fail(`${p}.content`, 'longer than 50000 characters');
    return { path, content: fo.content as string };
  }, 80);
  uniqueIds(files.map((f) => f.path), 'files');
  return { files };
}
