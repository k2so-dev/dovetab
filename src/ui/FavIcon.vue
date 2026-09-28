<script setup lang="ts" vapor>
import { computed } from 'vue'
import { colorFor, iconSrc, iconsReady, onIconError, onIconLoad } from '@/core/favicon'
import type { Bookmark } from '@/core/tree'

const { b, size } = defineProps<{ b: Bookmark; size: 16 | 18 | 22 | 36 }>()

const src = computed(() => (iconsReady.value ? iconSrc(b) : null))
const letter = computed(() => (b.title.trim()[0] ?? b.host[0] ?? '?').toUpperCase())
const box = {
  16: 'size-4 rounded-[4px] text-[9.5px]',
  18: 'size-[18px] rounded-[5px] text-[10px]',
  22: 'size-[22px] rounded-md text-[11px]',
  36: 'size-9 rounded-[9px] text-base',
}[size]
const img = { 16: 'size-4', 18: 'size-4', 22: 'size-4', 36: 'size-6' }[size]
</script>

<template>
  <div
    v-if="src"
    class="relative grid flex-none place-items-center"
    :class="[box, size === 36 && 'bg-accent shadow-[inset_0_0_0_1px_var(--border)]']"
  >
    <img
      :src="src"
      :class="img"
      alt=""
      decoding="async"
      loading="lazy"
      draggable="false"
      @load="onIconLoad(b, $event.target as HTMLImageElement)"
      @error="onIconError(b)"
    />
  </div>
  <div
    v-else
    class="relative grid flex-none place-items-center font-semibold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
    :class="box"
    :style="{ background: iconsReady ? colorFor(b.host) : 'var(--accent)' }"
  >
    {{ iconsReady ? letter : '' }}
  </div>
</template>
