// Not part of the test run (see the "screenshots" project): `npm run screenshots` rewrites docs/screenshots/*.png from
// the running app with the stub router's data.
import { test } from '@playwright/test';
import { VISITOR_URL } from './config.ts';

const OUT = 'docs/screenshots';
test.use({ viewport: { width: 1280, height: 800 } });

test('screenshots', async ({ page, browser }) => {
  await page.goto('/#/ideas');
  await page.getByTestId('stack').selectOption('typescript');
  await page.getByTestId('topic').fill('habit tracking');
  await page.getByTestId('request-ideas').click();
  await page.getByTestId('idea-card').first().waitFor();
  await page.screenshot({ path: `${OUT}/ideas.png`, fullPage: true });

  await page.goto('/#/board');
  await page.getByTestId('project-card').first().waitFor();
  await page.screenshot({ path: `${OUT}/board.png`, fullPage: true });

  // The example project, with a steered architecture so the version history shows.
  await page.getByRole('link', { name: 'Habit tracker (example)' }).click();
  await page.getByTestId('tab-architecture').click();
  await page.getByTestId('extra-prompt').fill('use event sourcing');
  await page.getByTestId('generate').click();
  await page.getByTestId('version-2').waitFor();
  await page.locator('[data-testid=diagram] svg').first().waitFor();
  await page.screenshot({ path: `${OUT}/project.png`, fullPage: true });

  const visitor = await browser.newPage({ baseURL: VISITOR_URL, viewport: { width: 1280, height: 800 } });
  await visitor.goto('/');
  await visitor.getByTestId('project-card').first().waitFor();
  await visitor.screenshot({ path: `${OUT}/visitor.png`, fullPage: true });
});
