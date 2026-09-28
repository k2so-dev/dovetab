<script setup lang="ts" vapor>
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <span
    role="switch"
    :aria-checked="model"
    class="h-5 w-9 flex-none rounded-full p-0.5 motion:transition-colors"
    :class="model ? 'bg-fg' : 'bg-accent2'"
  >
    <span
      class="block size-4 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.25)] motion:transition-transform"
      :class="model ? 'translate-x-4 bg-bg' : 'bg-white'"
    ></span>
  </span>
</template>
