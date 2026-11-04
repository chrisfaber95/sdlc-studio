<script setup lang="ts">
import { ref } from 'vue';
import { api, errorMessage } from '../api';
import ErrorBanner from '../components/ErrorBanner.vue';
import { navigate } from '../route';
import { EFFORTS, STACKS } from '../types';
import type { Effort, Idea, Stack } from '../types';

const stack = ref<Stack>('typescript');
const topic = ref('');
const effort = ref<Effort>('small');
const prompt = ref('');
const ideas = ref<Idea[]>([]);
const busy = ref(false);
const error = ref('');

async function request(): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    ideas.value = await api.ideas({
      stack: stack.value,
      topic: topic.value,
      effort: effort.value,
      ...(prompt.value.trim() && { prompt: prompt.value.trim() }),
    });
  } catch (err) {
    error.value = errorMessage(err); // earlier ideas stay on screen
  } finally {
    busy.value = false;
  }
}

async function choose(idea: Idea): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const { project } = await api.chooseIdea(stack.value, idea);
    navigate(`#/project/${project.id}`);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section>
    <h2>Find project ideas</h2>
    <form
      data-testid="idea-form"
      @submit.prevent="request"
    >
      <label>Stack
        <select
          v-model="stack"
          data-testid="stack"
        >
          <option
            v-for="s in STACKS"
            :key="s"
          >{{ s }}</option>
        </select>
      </label>
      <label>Topic
        <input
          v-model="topic"
          data-testid="topic"
          required
          maxlength="500"
          placeholder="e.g. developer tooling"
        >
      </label>
      <label>Effort
        <select
          v-model="effort"
          data-testid="effort"
        >
          <option
            v-for="e in EFFORTS"
            :key="e"
          >{{ e }}</option>
        </select>
      </label>
      <label>Extra prompt (optional)
        <input
          v-model="prompt"
          data-testid="idea-prompt"
          maxlength="4000"
        >
      </label>
      <button
        type="submit"
        :disabled="busy || !topic.trim()"
        data-testid="request-ideas"
      >
        {{ busy ? 'Working…' : 'Get ideas' }}
      </button>
    </form>
    <ErrorBanner :message="error" />
    <ul
      class="cards"
      data-testid="idea-list"
    >
      <li
        v-for="idea in ideas"
        :key="idea.title"
        class="card"
        data-testid="idea-card"
      >
        <h3>{{ idea.title }}</h3>
        <p>{{ idea.summary }}</p>
        <p>
          <span data-testid="idea-effort">{{ idea.effort }} (~{{ idea.estimateHours }} h)</span>
          · novelty <span data-testid="idea-novelty">{{ idea.noveltyScore }}</span>/10
        </p>
        <p>
          <span
            v-for="t in idea.skillTags"
            :key="t"
            class="tag"
            data-testid="idea-tag"
          >{{ t }}</span>
        </p>
        <button
          :disabled="busy"
          data-testid="choose-idea"
          @click="choose(idea)"
        >
          Choose
        </button>
      </li>
    </ul>
  </section>
</template>
