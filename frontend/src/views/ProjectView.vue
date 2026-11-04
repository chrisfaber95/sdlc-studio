<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, errorMessage } from '../api';
import ArtifactBody from '../components/ArtifactBody.vue';
import ErrorBanner from '../components/ErrorBanner.vue';
import { KIND_LABELS } from '../types';
import type { Artifact, ArtifactKind, GeneratedKind, Project } from '../types';

const props = defineProps<{ id: number; readOnly: boolean }>();

const TABS: ArtifactKind[] = ['idea', 'requirements', 'architecture', 'test_plan', 'scaffold'];
const PREVIOUS: Record<GeneratedKind, ArtifactKind> = {
  requirements: 'idea',
  architecture: 'requirements',
  test_plan: 'architecture',
  scaffold: 'test_plan',
};

const project = ref<Project | null>(null);
const artifacts = ref<Artifact[]>([]);
const tab = ref<ArtifactKind>('requirements');
const picked = ref<Record<string, number>>({});
const extraPrompt = ref('');
const loadError = ref('');
const genError = ref('');
const busy = ref(false);

const versions = computed(() =>
  artifacts.value.filter((a) => a.kind === tab.value).sort((a, b) => b.version - a.version),
);
const shown = computed(() => versions.value.find((a) => a.version === picked.value[tab.value]) ?? versions.value[0]);
const has = (kind: ArtifactKind) => artifacts.value.some((a) => a.kind === kind);
const blockedBy = computed(() => {
  if (tab.value === 'idea') return null;
  const prev = PREVIOUS[tab.value];
  return has(prev) ? null : KIND_LABELS[prev];
});

async function load(): Promise<void> {
  loadError.value = '';
  try {
    [project.value, artifacts.value] = await Promise.all([api.project(props.id), api.artifacts(props.id)]);
  } catch (err) {
    loadError.value = errorMessage(err);
  }
}

async function generate(): Promise<void> {
  if (tab.value === 'idea') return;
  const kind = tab.value;
  busy.value = true;
  genError.value = '';
  try {
    const created = await api.generate(props.id, kind, extraPrompt.value.trim() || undefined);
    artifacts.value = [...artifacts.value, created];
    delete picked.value[kind]; // jump to the new version; older ones stay in the history
    extraPrompt.value = '';
  } catch (err) {
    genError.value = `Generating ${KIND_LABELS[kind].toLowerCase()} failed: ${errorMessage(err)} Earlier versions are kept.`;
  } finally {
    busy.value = false;
  }
}

watch(tab, () => (genError.value = ''));
watch(() => props.id, load);
onMounted(load);
</script>

<template>
  <section>
    <ErrorBanner :message="loadError" />
    <template v-if="project">
      <h2 data-testid="project-title">
        {{ project.title }}
        <small>{{ project.stack }} · {{ project.stage }}</small>
      </h2>
      <p>
        <a
          :href="api.downloadUrl(project.id)"
          download
          data-testid="download"
        >Download ZIP</a>
      </p>

      <div
        role="tablist"
        aria-label="Stages"
      >
        <button
          v-for="k in TABS"
          :key="k"
          role="tab"
          :aria-selected="tab === k"
          :class="{ active: tab === k }"
          :data-testid="`tab-${k}`"
          @click="tab = k"
        >
          {{ KIND_LABELS[k] }}{{ has(k) ? '' : ' (empty)' }}
        </button>
      </div>

      <div role="tabpanel">
        <form
          v-if="!readOnly && tab !== 'idea'"
          data-testid="generate-form"
          @submit.prevent="generate"
        >
          <label>Extra prompt (optional)
            <textarea
              v-model="extraPrompt"
              data-testid="extra-prompt"
              maxlength="4000"
              rows="2"
            />
          </label>
          <button
            type="submit"
            :disabled="busy || blockedBy !== null"
            data-testid="generate"
          >
            {{ busy ? 'Generating…' : has(tab) ? 'Regenerate' : 'Generate' }}
          </button>
          <span v-if="blockedBy"> Generate {{ blockedBy.toLowerCase() }} first.</span>
        </form>
        <ErrorBanner :message="genError" />

        <template v-if="shown">
          <p data-testid="artifact-meta">
            Version {{ shown.version }} of {{ versions.length }} ·
            <span
              class="tier"
              data-testid="tier"
            >tier: {{ shown.tier }}</span>
            <span v-if="shown.prompt"> · extra prompt: “{{ shown.prompt }}”</span>
          </p>
          <ul
            v-if="versions.length > 1"
            data-testid="versions"
            aria-label="Version history"
          >
            <li
              v-for="v in versions"
              :key="v.version"
            >
              <button
                :aria-pressed="v.version === shown.version"
                :data-testid="`version-${v.version}`"
                @click="picked[tab] = v.version"
              >
                v{{ v.version }} · {{ v.tier }}
              </button>
            </li>
          </ul>
          <ArtifactBody
            :key="shown.id"
            :artifact="shown"
          />
        </template>
        <p
          v-else
          data-testid="empty"
        >
          Nothing generated for this stage yet.
        </p>
      </div>
    </template>
  </section>
</template>
