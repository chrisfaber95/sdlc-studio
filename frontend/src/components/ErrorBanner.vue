<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <p
    v-if="message"
    role="alert"
    class="error"
    data-testid="error"
  >
    {{ message }}
  </p>
</template>
