import { computed, ref } from 'vue';

export type Route = { name: 'ideas' } | { name: 'board' } | { name: 'project'; id: number };

export function parseHash(hash: string): Route {
  const m = /^#\/project\/(\d+)$/.exec(hash);
  if (m) return { name: 'project', id: Number(m[1]) };
  if (hash === '#/ideas') return { name: 'ideas' };
  return { name: 'board' };
}

const hash = ref(window.location.hash);
window.addEventListener('hashchange', () => (hash.value = window.location.hash));

export const route = computed(() => parseHash(hash.value));

export function navigate(to: string): void {
  window.location.hash = to;
  hash.value = to;
}
