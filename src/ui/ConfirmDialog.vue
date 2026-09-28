<script setup lang="ts" vapor>
import { ui } from '@/core/ui'
import Modal from './Modal.vue'
</script>

<template>
  <Modal :open="!!ui.confirm" @close="ui.confirm = null">
    <div v-if="ui.confirm" class="w-[min(420px,calc(100vw-32px))]">
      <div class="px-5 pt-[18px] pb-5">
        <div class="text-base font-semibold tracking-[-0.01em]">{{ ui.confirm.title }}</div>
        <p class="mt-2 text-[13.5px] text-pretty text-mfg">{{ ui.confirm.body }}</p>
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
          @click="ui.confirm.run()"
        >
          {{ ui.confirm.action }}
        </button>
      </div>
    </div>
  </Modal>
</template>
