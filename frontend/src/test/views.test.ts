import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.vue';
import BoardView from '../views/BoardView.vue';
import IdeasView from '../views/IdeasView.vue';
import ProjectView from '../views/ProjectView.vue';
import { architecture, artifact, failure, idea, project, requirements, stubApi } from './helpers';

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg data-rendered="1"></svg>' })) },
}));

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => vi.unstubAllGlobals());

describe('IdeasView', () => {
  it('requests ideas and shows effort, novelty and skill tags, and chooses one', async () => {
    const calls = stubApi(({ url }) => {
      if (url === '/api/ideas') return { ideas: [idea('A'), idea('B'), idea('C')] };
      return { project: project({ id: 7 }), artifact: artifact('idea', 1, idea('A')) };
    });
    const w = mount(IdeasView);
    await w.get('[data-testid=stack]').setValue('go');
    await w.get('[data-testid=topic]').setValue('cli tools');
    await w.get('[data-testid=effort]').setValue('medium');
    await w.get('[data-testid=idea-form]').trigger('submit');
    await flushPromises();

    expect(calls[0]?.body).toEqual({ stack: 'go', topic: 'cli tools', effort: 'medium' });
    const cards = w.findAll('[data-testid=idea-card]');
    expect(cards).toHaveLength(3);
    expect(cards[0]?.text()).toContain('About A');
    expect(cards[0]?.get('[data-testid=idea-effort]').text()).toContain('small');
    expect(cards[0]?.get('[data-testid=idea-novelty]').text()).toBe('7');
    expect(cards[0]?.findAll('[data-testid=idea-tag]')).toHaveLength(2);

    await cards[0]?.get('[data-testid=choose-idea]').trigger('click');
    await flushPromises();
    expect(calls[1]).toMatchObject({ method: 'POST', url: '/api/projects/from-idea', body: { stack: 'go' } });
    expect(window.location.hash).toBe('#/project/7');
  });

  it('shows the error and keeps earlier ideas when the router is unavailable', async () => {
    let fail = false;
    stubApi(() => (fail ? failure(502, 'router_unavailable', 'The router is unavailable.') : { ideas: [idea('A'), idea('B'), idea('C')] }));
    const w = mount(IdeasView);
    await w.get('[data-testid=topic]').setValue('x');
    await w.get('[data-testid=idea-form]').trigger('submit');
    await flushPromises();
    fail = true;
    await w.get('[data-testid=idea-form]').trigger('submit');
    await flushPromises();
    expect(w.get('[data-testid=error]').text()).toContain('router is unavailable');
    expect(w.findAll('[data-testid=idea-card]')).toHaveLength(3);
  });
});

describe('ProjectView', () => {
  const base = [artifact('idea', 1, idea('A')), artifact('requirements', 1, requirements('first want'))];

  it('regenerates with an extra prompt and keeps the earlier version viewable', async () => {
    const stored = [...base];
    const calls = stubApi(({ method, url, body }) => {
      if (method === 'POST') {
        const created = artifact('requirements', 2, requirements('second want'), {
          prompt: (body as { prompt: string }).prompt,
          tier: 'claude',
        });
        stored.push(created);
        return created;
      }
      return url.endsWith('/artifacts') ? stored : project();
    });
    const w = mount(ProjectView, { props: { id: 1, readOnly: false } });
    await flushPromises();
    expect(w.get('[data-testid=artifact-body]').text()).toContain('first want');
    expect(w.get('[data-testid=tier]').text()).toContain('local');

    await w.get('[data-testid=extra-prompt]').setValue('focus on offline');
    await w.get('[data-testid=generate-form]').trigger('submit');
    await flushPromises();
    expect(calls.at(-1)).toMatchObject({ url: '/api/projects/1/generate/requirements', body: { prompt: 'focus on offline' } });
    expect(w.get('[data-testid=artifact-body]').text()).toContain('second want');
    expect(w.get('[data-testid=tier]').text()).toContain('claude');

    await w.get('[data-testid=version-1]').trigger('click');
    expect(w.get('[data-testid=artifact-body]').text()).toContain('first want');
  });

  it('shows the error and keeps the earlier artifact when generation fails', async () => {
    stubApi(({ method, url }) => {
      if (method === 'POST') return failure(502, 'router_unavailable', 'The router is unavailable.');
      return url.endsWith('/artifacts') ? base : project();
    });
    const w = mount(ProjectView, { props: { id: 1, readOnly: false } });
    await flushPromises();
    await w.get('[data-testid=generate-form]').trigger('submit');
    await flushPromises();
    expect(w.get('[data-testid=error]').text()).toContain('router is unavailable');
    expect(w.get('[data-testid=artifact-body]').text()).toContain('first want');
  });

  it('renders the architecture with a Mermaid diagram', async () => {
    stubApi(({ url }) => (url.endsWith('/artifacts') ? [...base, artifact('architecture', 1, architecture)] : project()));
    const w = mount(ProjectView, { props: { id: 1, readOnly: false } });
    await flushPromises();
    await w.get('[data-testid=tab-architecture]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid=diagram]').html()).toContain('data-rendered');
    expect(w.text()).toContain('Use SQLite');
  });

  it('blocks a stage whose previous stage is missing and offers the ZIP', async () => {
    stubApi(({ url }) => (url.endsWith('/artifacts') ? base.slice(0, 1) : project()));
    const w = mount(ProjectView, { props: { id: 1, readOnly: false } });
    await flushPromises();
    await w.get('[data-testid=tab-architecture]').trigger('click');
    expect(w.get('[data-testid=generate]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid=download]').attributes('href')).toBe('/api/projects/1/download');
  });

  it('publishes to a private repo when the server can, then links to it', async () => {
    const calls = stubApi(({ url, method }) => {
      if (method === 'POST') return project({ repoUrl: 'https://github.com/me/demo' });
      return url.endsWith('/artifacts') ? base : project();
    });
    const w = mount(ProjectView, { props: { id: 1, readOnly: false, canPublish: true } });
    await flushPromises();
    await w.get('[data-testid=repo-name]').setValue('demo');
    await w.get('[data-testid=publish-form]').trigger('submit');
    await flushPromises();
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/api/projects/1/publish', body: { name: 'demo' } });
    expect(w.find('[data-testid=publish-form]').exists()).toBe(false);
    expect(w.get('[data-testid=repo] a').attributes('href')).toBe('https://github.com/me/demo');
  });

  it('shows why publishing failed and offers no publish without a token or for a visitor', async () => {
    stubApi(({ url, method }) =>
      method === 'POST' ? failure(409, 'name_taken', 'GitHub cannot create "demo".') : url.endsWith('/artifacts') ? base : project(),
    );
    const w = mount(ProjectView, { props: { id: 1, readOnly: false, canPublish: true } });
    await flushPromises();
    await w.get('[data-testid=publish-form]').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('GitHub cannot create "demo".');
    expect(mount(ProjectView, { props: { id: 1, readOnly: false } }).find('[data-testid=publish-form]').exists()).toBe(false);
    expect(mount(ProjectView, { props: { id: 1, readOnly: true, canPublish: true } }).find('[data-testid=publish-form]').exists()).toBe(false);
  });

  it('has no generate controls for a visitor', async () => {
    stubApi(({ url }) => (url.endsWith('/artifacts') ? base : project()));
    const w = mount(ProjectView, { props: { id: 1, readOnly: true } });
    await flushPromises();
    expect(w.find('[data-testid=generate-form]').exists()).toBe(false);
    expect(w.get('[data-testid=artifact-body]').text()).toContain('first want');
  });
});

describe('BoardView', () => {
  const projects = [project({ id: 1, title: 'One', stage: 'ideate' }), project({ id: 2, title: 'Two', stage: 'build' })];

  it('puts every project in its stage column and moves one via PATCH', async () => {
    const calls = stubApi(({ method, body }) =>
      method === 'PATCH' ? project({ id: 1, title: 'One', stage: (body as { stage: 'ship' }).stage }) : projects,
    );
    const w = mount(BoardView, { props: { readOnly: false } });
    await flushPromises();
    expect(w.findAll('[data-testid^=column-]')).toHaveLength(6);
    expect(w.get('[data-testid=column-ideate]').text()).toContain('One');
    expect(w.get('[data-testid=column-build]').text()).toContain('Two');

    await w.get('[data-testid=column-ideate] [data-testid=move]').setValue('ship');
    await flushPromises();
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', url: '/api/projects/1', body: { stage: 'ship' } });
    expect(w.get('[data-testid=column-ship]').text()).toContain('One');
    expect(w.get('[data-testid=column-ideate]').text()).not.toContain('One');
  });

  it('keeps the card in place and shows an error when the move is refused', async () => {
    stubApi(({ method }) => (method === 'PATCH' ? failure(403, 'forbidden', 'Read-only access.') : projects));
    const w = mount(BoardView, { props: { readOnly: false } });
    await flushPromises();
    await w.get('[data-testid=column-ideate] [data-testid=move]').setValue('ship');
    await flushPromises();
    expect(w.get('[data-testid=error]').text()).toContain('Read-only');
    expect(w.get('[data-testid=column-ideate]').text()).toContain('One');
  });

  it('has no move controls for a visitor', async () => {
    stubApi(() => projects);
    const w = mount(BoardView, { props: { readOnly: true } });
    await flushPromises();
    expect(w.find('[data-testid=move]').exists()).toBe(false);
  });
});

describe('App', () => {
  it('shows a visitor only the read-only examples, without a way to create ideas', async () => {
    stubApi(({ url }) => (url === '/api/me' ? { role: 'visitor', identity: null } : [project()]));
    const w = mount(App);
    await flushPromises();
    expect(w.get('[data-testid=role]').text()).toContain('Read-only');
    expect(w.find('[data-testid=nav-ideas]').exists()).toBe(false);
    expect(w.find('[data-testid=move]').exists()).toBe(false);
    expect(w.get('[data-testid=board]').text()).toContain('Demo');
  });

  it('shows the owner the controls', async () => {
    stubApi(({ url }) => (url === '/api/me' ? { role: 'owner', identity: 'x' } : [project()]));
    const w = mount(App);
    await flushPromises();
    expect(w.find('[data-testid=nav-ideas]').exists()).toBe(true);
    expect(w.find('[data-testid=move]').exists()).toBe(true);
  });

  it('shows an error when the server fails', async () => {
    stubApi(() => failure(500, 'internal', 'Internal error'));
    const w = mount(App);
    await flushPromises();
    expect(w.get('[data-testid=error]').text()).toContain('Internal error');
  });
});
