<script setup lang="ts" vapor>
import { computed } from 'vue'
import { ui } from '@/core/ui'
import Modal from './Modal.vue'

let last: typeof ui.confirm = null
const c = computed(() => (last = ui.confirm ?? last))
</script>

<template>
  <Modal :open="!!ui.confirm" @close="ui.confirm = null">
    <div v-if="c" class="w-[min(420px,calc(100vw-32px))]">
      <div class="px-5 pt-[18px] pb-5">
        <div class="text-base font-semibold tracking-[-0.01em]">{{ c.title }}</div>
        <p class="mt-2 text-[13.5px] text-pretty text-mfg">{{ c.body }}</p>
      </div>
      <div class="flex justify-end gap-2 border-t border-border px-5 py-3.5">
        <button
          type="button"
          autofocus
          class="flex h-[34px] items-center rounded-lg border border-border px-3.5 text-[13.5px] font-medium hover:bg-accent"
          @click="ui.confirm = null"
        >
          Cancel
        </button>
        <button
          type="button"
          class="flex h-[34px] items-center rounded-lg bg-danger px-3.5 text-[13.5px] font-medium text-white hover:opacity-90"
          @click="c.run()"
        >
          {{ c.action }}
        </button>
      </div>
    </div>
  </Modal>
</template>
