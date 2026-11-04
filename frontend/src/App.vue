<script setup lang="ts">
import { onMounted, ref } from 'vue';

interface Me {
  role: 'owner' | 'visitor';
}
interface ProjectSummary {
  id: number;
  title: string;
  stack: string;
  stage: string;
}

const me = ref<Me | null>(null);
const projects = ref<ProjectSummary[]>([]);
const error = ref('');

onMounted(async () => {
  try {
    const [meRes, projectsRes] = await Promise.all([fetch('/api/me'), fetch('/api/projects')]);
    if (!meRes.ok || !projectsRes.ok) throw new Error(`Server answered ${meRes.status}/${projectsRes.status}`);
    me.value = (await meRes.json()) as Me;
    projects.value = (await projectsRes.json()) as ProjectSummary[];
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load projects';
  }
});
</script>

<template>
  <main>
    <h1>SDLC Studio</h1>
    <p
      v-if="me"
      data-testid="role"
    >
      {{ me.role === 'owner' ? 'Signed in as owner' : 'Read-only view: example projects' }}
    </p>
    <p
      v-if="error"
      role="alert"
      data-testid="error"
    >
      {{ error }}
    </p>
    <ul
      v-else
      data-testid="project-list"
    >
      <li
        v-for="p in projects"
        :key="p.id"
      >
        {{ p.title }} ({{ p.stack }}, {{ p.stage }})
      </li>
    </ul>
  </main>
</template>
