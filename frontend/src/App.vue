<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, errorMessage } from './api';
import ErrorBanner from './components/ErrorBanner.vue';
import { route } from './route';
import BoardView from './views/BoardView.vue';
import IdeasView from './views/IdeasView.vue';
import ProjectView from './views/ProjectView.vue';
import type { Me } from './types';

const me = ref<Me | null>(null);
const error = ref('');
const readOnly = computed(() => me.value?.role !== 'owner');

onMounted(async () => {
  try {
    me.value = await api.me();
  } catch (err) {
    error.value = errorMessage(err);
  }
});
</script>

<template>
  <header>
    <h1>SDLC Studio</h1>
    <nav
      v-if="me"
      aria-label="Main"
    >
      <a
        href="#/board"
        data-testid="nav-board"
      >{{ readOnly ? 'Examples' : 'Board' }}</a>
      <a
        v-if="!readOnly"
        href="#/ideas"
        data-testid="nav-ideas"
      >New idea</a>
    </nav>
    <p
      v-if="me"
      data-testid="role"
    >
      {{ readOnly ? 'Read-only view: example projects' : 'Signed in as owner' }}
    </p>
  </header>
  <main>
    <ErrorBanner :message="error" />
    <template v-if="me">
      <ProjectView
        v-if="route.name === 'project'"
        :id="route.id"
        :key="route.id"
        :read-only="readOnly"
        :can-publish="me?.canPublish === true"
      />
      <IdeasView v-else-if="route.name === 'ideas' && !readOnly" />
      <BoardView
        v-else
        :read-only="readOnly"
      />
    </template>
  </main>
</template>
