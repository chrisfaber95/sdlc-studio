<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const props = defineProps<{ source: string }>();
const svg = ref('');
const failed = ref('');
let counter = 0;

async function draw(): Promise<void> {
  failed.value = '';
  svg.value = '';
  try {
    // Loaded on demand: Mermaid is large and only the architecture tab needs it.
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    svg.value = (await mermaid.render(`mermaid-${++counter}-${Date.now()}`, props.source)).svg;
  } catch (err) {
    failed.value = err instanceof Error ? err.message : 'Could not render the diagram.';
  }
}

onMounted(draw);
watch(() => props.source, draw);
</script>

<template>
  <div data-testid="diagram">
    <!-- eslint-disable vue/no-v-html -- SVG from Mermaid in strict security mode -->
    <div
      v-if="svg"
      class="diagram"
      v-html="svg"
    />
    <!-- eslint-enable vue/no-v-html -->
    <div
      v-else-if="failed"
      role="alert"
      data-testid="diagram-error"
    >
      <p>The diagram could not be rendered: {{ failed }}</p>
      <pre>{{ source }}</pre>
    </div>
    <p v-else>
      Rendering diagram…
    </p>
  </div>
</template>
