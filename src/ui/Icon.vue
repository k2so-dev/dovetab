<script setup lang="ts" vapor>
import type { IconName } from './icons.gen'

const { name, size = 15, stroke = 1.75 } = defineProps<{ name: IconName; size?: number; stroke?: number }>()
</script>

<template>
  <svg
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="flex-none"
  >
    <use :href="`#i-${name}`" />
  </svg>
</template>
