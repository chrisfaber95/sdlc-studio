<script setup lang="ts">
import { computed } from 'vue';
import type { Architecture, Artifact, Idea, Requirements, Scaffold, TestPlan } from '../types';
import MermaidDiagram from './MermaidDiagram.vue';

const props = defineProps<{ artifact: Artifact }>();

const parsed = computed<unknown>(() => {
  try {
    return JSON.parse(props.artifact.content);
  } catch {
    return undefined;
  }
});
const idea = computed(() => parsed.value as Idea);
const requirements = computed(() => parsed.value as Requirements);
const architecture = computed(() => parsed.value as Architecture);
const testPlan = computed(() => parsed.value as TestPlan);
const scaffold = computed(() => parsed.value as Scaffold);
</script>

<template>
  <div data-testid="artifact-body">
    <pre
      v-if="parsed === undefined"
      data-testid="artifact-raw"
    >{{ artifact.content }}</pre>

    <section v-else-if="artifact.kind === 'idea'">
      <h3>{{ idea.title }}</h3>
      <p>{{ idea.summary }}</p>
      <p>Effort {{ idea.effort }} (about {{ idea.estimateHours }} h), novelty {{ idea.noveltyScore }}/10</p>
      <p>Skills: {{ idea.skillTags.join(', ') }}</p>
    </section>

    <section v-else-if="artifact.kind === 'requirements'">
      <article
        v-for="s in requirements.userStories"
        :key="s.id"
      >
        <h3>{{ s.id }}: As {{ s.role }}, I want {{ s.want }}, so that {{ s.benefit }}</h3>
        <ul>
          <li
            v-for="c in s.acceptanceCriteria"
            :key="c.id"
          >
            <strong>{{ c.id }}</strong> {{ c.text }}
          </li>
        </ul>
      </article>
    </section>

    <section v-else-if="artifact.kind === 'architecture'">
      <p>{{ architecture.overview }}</p>
      <h3>Diagrams</h3>
      <figure
        v-for="(d, i) in architecture.diagrams"
        :key="i"
      >
        <figcaption>{{ d.title }}</figcaption>
        <MermaidDiagram :source="d.mermaid" />
      </figure>
      <h3>Components</h3>
      <ul>
        <li
          v-for="c in architecture.components"
          :key="c.name"
        >
          <strong>{{ c.name }}</strong>
          <span v-if="c.technology"> ({{ c.technology }})</span>: {{ c.responsibility }}
        </li>
      </ul>
      <h3>Data model</h3>
      <div
        v-for="e in architecture.dataModel"
        :key="e.entity"
      >
        <strong>{{ e.entity }}</strong>: {{ e.fields.map((f) => `${f.name} ${f.type}`).join(', ') }}
        <span v-if="e.relations?.length"> — {{ e.relations.join('; ') }}</span>
      </div>
      <h3>Decision records</h3>
      <article
        v-for="d in architecture.decisions"
        :key="d.id"
      >
        <h4>{{ d.id }}: {{ d.title }}</h4>
        <p><strong>Context.</strong> {{ d.context }}</p>
        <p><strong>Decision.</strong> {{ d.decision }}</p>
        <p><strong>Consequences.</strong> {{ d.consequences }}</p>
      </article>
    </section>

    <section v-else-if="artifact.kind === 'test_plan'">
      <p>{{ testPlan.strategy }}</p>
      <table>
        <thead>
          <tr>
            <th>Case</th>
            <th>Type</th>
            <th>Checks</th>
            <th>Expected</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in testPlan.testCases"
            :key="t.id"
          >
            <td>{{ t.id }}: {{ t.title }}</td>
            <td>{{ t.type }}</td>
            <td>{{ t.acceptanceCriteria.join(', ') }}</td>
            <td>{{ t.expected }}</td>
          </tr>
        </tbody>
      </table>
      <h3>CI workflow: {{ testPlan.ciWorkflow.path }}</h3>
      <pre>{{ testPlan.ciWorkflow.content }}</pre>
    </section>

    <section v-else-if="artifact.kind === 'scaffold'">
      <p>{{ scaffold.summary }}</p>
      <details
        v-for="f in scaffold.files"
        :key="f.path"
      >
        <summary>{{ f.path }}</summary>
        <pre>{{ f.content }}</pre>
      </details>
    </section>
  </div>
</template>
