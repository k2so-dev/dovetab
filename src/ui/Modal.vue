<script setup lang="ts" vapor>
import { nextTick, onMounted, ref, watch } from 'vue'

const { open, top = false } = defineProps<{ open: boolean; top?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const el = ref<HTMLDialogElement>()

async function sync() {
  const d = el.value
  if (!d) return
  if (open && !d.open) {
    d.showModal()
    await nextTick()
    d.querySelector<HTMLElement>('[autofocus]')?.focus()
  } else if (!open && d.open) d.close()
}
onMounted(sync)
watch(() => open, sync)
</script>

<template>
  <dialog
    ref="el"
    class="rounded-[14px] bg-pop shadow-pop outline-none motion:animate-pop"
    :class="top ? 'mx-auto mt-[14vh] mb-auto' : 'm-auto'"
    @close="emit('close')"
    @click.self="emit('close')"
  >
    <slot v-if="open" />
  </dialog>
</template>
