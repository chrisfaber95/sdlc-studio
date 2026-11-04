import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';

afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown) => new Response(JSON.stringify(body));

describe('App', () => {
  it('lists projects and shows the visitor notice', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      reply(url === '/api/me' ? { role: 'visitor' } : [{ id: 1, title: 'Demo', stack: 'vue', stage: 'ideate' }]),
    );
    const w = mount(App);
    await flushPromises();
    expect(w.get('[data-testid=role]').text()).toContain('Read-only');
    expect(w.get('[data-testid=project-list]').text()).toContain('Demo');
  });

  it('shows an error when the server fails', async () => {
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }));
    const w = mount(App);
    await flushPromises();
    expect(w.find('[data-testid=error]').exists()).toBe(true);
  });
});
