<script setup lang="ts" vapor>
import { runUndo, ui } from '@/core/ui'
</script>

<template>
  <div
    v-if="ui.toast"
    role="status"
    class="fixed bottom-6 left-1/2 z-60 flex h-11 -translate-x-1/2 items-center gap-3.5 rounded-[10px] bg-pop pr-2 pl-4 text-[13.5px] shadow-pop motion:animate-pop"
    :class="!ui.toast.undo && 'pr-4'"
  >
    <span>{{ ui.toast.text }}</span>
    <button
      v-if="ui.toast.undo"
      type="button"
      class="flex h-[30px] items-center rounded-[7px] bg-accent px-3 font-medium hover:bg-accent2"
      @click="runUndo"
    >
      Undo
    </button>
  </div>
</template>
