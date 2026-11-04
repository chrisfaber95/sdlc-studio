<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, errorMessage } from '../api';
import ErrorBanner from '../components/ErrorBanner.vue';
import { STAGES, STAGE_LABELS } from '../types';
import type { Project, Stage } from '../types';

defineProps<{ readOnly: boolean }>();

const projects = ref<Project[]>([]);
const error = ref('');
const loaded = ref(false);

async function load(): Promise<void> {
  try {
    projects.value = await api.projects();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loaded.value = true;
  }
}

async function move(project: Project, stage: Stage): Promise<void> {
  error.value = '';
  try {
    const updated = await api.moveProject(project.id, stage);
    projects.value = projects.value.map((p) => (p.id === updated.id ? updated : p));
  } catch (err) {
    error.value = errorMessage(err); // the card stays in its column
  }
}

const inStage = (stage: Stage) => projects.value.filter((p) => p.stage === stage);
onMounted(load);
</script>

<template>
  <section>
    <h2>{{ readOnly ? 'Example projects' : 'Lifecycle board' }}</h2>
    <ErrorBanner :message="error" />
    <p v-if="loaded && !projects.length && !error">
      No projects yet.
    </p>
    <div
      class="board"
      data-testid="board"
    >
      <section
        v-for="stage in STAGES"
        :key="stage"
        class="column"
        :data-testid="`column-${stage}`"
        :aria-label="STAGE_LABELS[stage]"
      >
        <h3>{{ STAGE_LABELS[stage] }} ({{ inStage(stage).length }})</h3>
        <article
          v-for="p in inStage(stage)"
          :key="p.id"
          class="card"
          data-testid="project-card"
        >
          <a :href="`#/project/${p.id}`">{{ p.title }}</a>
          <small>{{ p.stack }}</small>
          <label v-if="!readOnly">Move to
            <select
              :value="p.stage"
              data-testid="move"
              @change="move(p, ($event.target as HTMLSelectElement).value as Stage)"
            >
              <option
                v-for="s in STAGES"
                :key="s"
                :value="s"
              >{{ STAGE_LABELS[s] }}</option>
            </select>
          </label>
        </article>
      </section>
    </div>
  </section>
</template>
