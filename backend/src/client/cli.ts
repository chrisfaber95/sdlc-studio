import { readFileSync } from 'node:fs';
import { isOneOf, STACKS } from '../db/model.ts';
import { EFFORTS } from '../pipeline/artifact-schemas.ts';
import type { Effort } from '../pipeline/artifact-schemas.ts';
import { GENERATED_KINDS } from '../pipeline/service.ts';
import { clientFromEnv, StudioApiError } from './studio-client.ts';

const USAGE = `usage (env: SDLC_URL, SDLC_OWNER_TOKEN):
  cli.ts ideas <stack> <effort> <topic...>
  cli.ts choose <stack>                    idea JSON on stdin
  cli.ts generate <id> <kind> [prompt...]  kind: ${GENERATED_KINDS.join('|')}
  cli.ts show <id> [kind]                  artifacts with version and tier
  cli.ts projects
  cli.ts download <id> <path>
  cli.ts publish <id> [repo-name]          new private GitHub repo with the project files`;

const fail = (msg: string): never => {
  throw new Error(msg);
};

async function run(argv: string[]): Promise<unknown> {
  const [cmd, ...a] = argv;
  const client = clientFromEnv();
  const id = (v: string | undefined): number => (Number.isInteger(Number(v)) ? Number(v) : fail('project id must be a number'));
  switch (cmd) {
    case 'ideas': {
      const [stack, effort, ...topic] = a;
      if (!isOneOf(STACKS, stack)) return fail(`stack must be one of ${STACKS.join(', ')}`);
      if (!isOneOf(EFFORTS, effort)) return fail(`effort must be one of ${EFFORTS.join(', ')}`);
      return client.ideas({ stack, effort: effort as Effort, topic: topic.join(' ') });
    }
    case 'choose': {
      if (!isOneOf(STACKS, a[0])) return fail(`stack must be one of ${STACKS.join(', ')}`);
      return client.chooseIdea({ stack: a[0], idea: JSON.parse(readFileSync(0, 'utf8')) });
    }
    case 'generate': {
      const [pid, kind, ...prompt] = a;
      if (!isOneOf(GENERATED_KINDS, kind)) return fail(`kind must be one of ${GENERATED_KINDS.join(', ')}`);
      const art = await client.generate(id(pid), kind, prompt.join(' ') || undefined);
      return { id: art.id, kind: art.kind, version: art.version, tier: art.tier, content: JSON.parse(art.content) };
    }
    case 'show': {
      const arts = await client.artifacts(id(a[0]), a[1] as never);
      return arts.map((x) => ({ kind: x.kind, version: x.version, tier: x.tier, prompt: x.prompt }));
    }
    case 'projects':
      return client.projects();
    case 'download': {
      if (!a[1]) return fail('download needs a target path');
      return { path: a[1], bytes: await client.downloadTo(id(a[0]), a[1]) };
    }
    case 'publish': {
      const project = await client.publish(id(a[0]), a[1]);
      return { repoUrl: project.repoUrl };
    }
    default:
      return fail(USAGE);
  }
}

try {
  console.log(JSON.stringify(await run(process.argv.slice(2)), null, 1));
} catch (err) {
  const msg =
    err instanceof StudioApiError && err.status === 403
      ? 'Refused (403): owner access needed. Set SDLC_OWNER_TOKEN.'
      : err instanceof StudioApiError
        ? `${err.status} ${err.code}: ${err.message}`
        : (err as Error).message;
  console.error(msg);
  process.exit(1);
}
