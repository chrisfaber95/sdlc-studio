import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzip } from '../backend/src/pipeline/zip.ts';
import { API_PORT, VISITOR_URL } from './config.ts';

const STAGES = [
  ['requirements', 'Requirements'],
  ['architecture', 'Architecture'],
  ['test_plan', 'Test plan'],
  ['scaffold', 'Scaffold'],
] as const;

async function generate(page: Page, kind: string, extraPrompt?: string): Promise<void> {
  await page.getByTestId(`tab-${kind}`).click();
  if (extraPrompt) await page.getByTestId('extra-prompt').fill(extraPrompt);
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('artifact-body')).toBeVisible();
}

// The owner's UI is the default baseURL: its dev server authenticates to the API as the owner, the way Tailscale
// Serve does (a plain link download cannot carry a header from the browser). The visitor's has no credentials.
test.describe('owner', () => {
  test('takes an idea to a downloaded ZIP, steers a stage and moves the project on the board', async ({ page }) => {
    await page.goto('/#/ideas');
    await expect(page.getByTestId('role')).toHaveText('Signed in as owner');

    // Ideas: at least three, each with effort, novelty and skill tags.
    await page.getByTestId('stack').selectOption('typescript');
    await page.getByTestId('topic').fill('habit tracking');
    await page.getByTestId('effort').selectOption('small');
    await page.getByTestId('request-ideas').click();
    const cards = page.getByTestId('idea-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.first().getByTestId('idea-effort')).toContainText('small');
    await expect(cards.first().getByTestId('idea-novelty')).toHaveText('6');
    await expect(cards.first().getByTestId('idea-tag')).not.toHaveCount(0);

    // Choosing an idea creates a project in "ideate" and opens it.
    await cards.first().getByTestId('choose-idea').click();
    await expect(page).toHaveURL(/#\/project\/\d+$/);
    await expect(page.getByTestId('project-title')).toContainText('ideate');
    const projectId = /project\/(\d+)/.exec(page.url())![1];

    // All four stages in order; each one is stored with the tier that made it.
    for (const [kind] of STAGES) {
      await generate(page, kind);
      await expect(page.getByTestId('tier')).toContainText(/tier: (local|claude)/);
      if (kind === 'architecture') await expect(page.locator('[data-testid=diagram] svg').first()).toBeVisible();
    }

    // Steering the architecture: a new version, and the first one stays viewable.
    await generate(page, 'architecture', 'use event sourcing');
    await expect(page.getByTestId('artifact-meta')).toContainText('Version 2 of 2');
    await expect(page.getByTestId('artifact-meta')).toContainText('use event sourcing');
    await expect(page.getByTestId('artifact-body')).toContainText('[use event sourcing]');
    await page.getByTestId('version-1').click();
    await expect(page.getByTestId('artifact-meta')).toContainText('Version 1 of 2');
    await expect(page.getByTestId('artifact-body')).not.toContainText('[use event sourcing]');

    // The ZIP holds the latest version of every artifact.
    const downloading = page.waitForEvent('download');
    await page.getByTestId('download').click();
    const download = await downloading;
    const files = unzip(await readFile((await download.path())!));
    const names = [...files.keys()];
    for (const expected of ['docs/idea.md', 'docs/requirements.md', 'docs/architecture.md', 'docs/test-plan.md', '.github/workflows/ci.yml', 'artifacts.json', 'src/index.ts']) {
      expect(names.some((n) => n.endsWith(expected)), `${expected} in ${names.join(', ')}`).toBe(true);
    }
    expect(names.some((n) => n.includes('docs/diagrams/') && n.endsWith('.mmd'))).toBe(true);
    const architecture = files.get(names.find((n) => n.endsWith('docs/architecture.md'))!)!;
    expect(architecture).toContain('[use event sourcing]');

    // Board: the project sits in Ideate; moving it persists across a reload.
    await page.getByTestId('nav-board').click();
    const card = page.getByTestId('column-ideate').getByTestId('project-card').filter({ has: page.locator(`a[href="#/project/${projectId}"]`) });
    await expect(card).toHaveCount(1);
    await card.getByTestId('move').selectOption('build');
    await expect(page.getByTestId('column-build').locator(`a[href="#/project/${projectId}"]`)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('column-build').locator(`a[href="#/project/${projectId}"]`)).toBeVisible();
    await expect(page.getByTestId('column-ideate').locator(`a[href="#/project/${projectId}"]`)).toHaveCount(0);
  });
});

test.describe('visitor', () => {
  test.use({ baseURL: VISITOR_URL });

  test('browses example projects and their artifacts, and cannot change anything', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.getByTestId('role')).toHaveText('Read-only view: example projects');
    await expect(page.getByTestId('nav-ideas')).toHaveCount(0);
    await expect(page.getByTestId('move')).toHaveCount(0);

    // Only the example is listed; the private project is not.
    const cards = page.getByTestId('project-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Habit tracker (example)');
    await cards.first().getByRole('link').click();

    await expect(page.getByTestId('project-title')).toContainText('Habit tracker (example)');
    await expect(page.getByTestId('generate-form')).toHaveCount(0);
    for (const [kind, label] of STAGES) {
      await page.getByTestId(`tab-${kind}`).click();
      await expect(page.getByTestId('tab-' + kind)).toContainText(label);
      await expect(page.getByTestId('artifact-body')).toBeVisible();
      await expect(page.getByTestId('tier')).toBeVisible();
    }

    // The server refuses writes, not just the UI. The project page is #/project/<id>.
    const id = /project\/(\d+)/.exec(page.url())![1];
    const api = `http://127.0.0.1:${API_PORT}`;
    for (const [method, url, data] of [
      ['post', `/api/projects/${id}/generate/requirements`, {}],
      ['patch', `/api/projects/${id}`, { stage: 'retro' }],
      ['post', '/api/ideas', { stack: 'go', topic: 't', effort: 'small' }],
    ] as const) {
      const res = await request[method](api + url, { data });
      expect(res.status(), `${method} ${url}`).toBe(403);
    }
    const after = await request.get(`${api}/api/projects/${id}`);
    expect((await after.json()).stage).toBe('ship');
  });
});
