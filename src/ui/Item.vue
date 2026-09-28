<script setup lang="ts" vapor>
import { computed } from 'vue'
import { colorFor } from '@/core/favicon'
import { settings } from '@/core/settings'
import type { Bookmark } from '@/core/tree'
import { dropOnBookmark, onBookmarkClick, ui } from '@/core/ui'
import { isPinned, metaText, type Meta } from '@/core/view'
import FavIcon from './FavIcon.vue'
import Icon from './Icon.vue'

const { b, meta, draggable } = defineProps<{ b: Bookmark; meta: Meta; draggable: boolean }>()

const pinned = computed(() => isPinned(b))
const glow = computed(() => ({ '--c': colorFor(b.host) }))
const dropping = computed(() => ui.over === b.id && ui.drag !== b.id)

function menuAt(x: number, y: number) {
  ui.menu = { kind: 'bookmark', id: b.id, x, y }
}
function onContext(e: MouseEvent) {
  e.preventDefault()
  menuAt(e.clientX, e.clientY)
}
function onMore(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menuAt(r.left, r.bottom + 4)
}

function onDragStart(e: DragEvent) {
  if (!draggable) return
  e.dataTransfer!.effectAllowed = 'copyMove'
  ui.drag = b.id
}
function onDragOver(e: DragEvent) {
  if (!draggable || !ui.drag) return
  e.preventDefault()
  ui.over = b.id
}
function onDrop(e: DragEvent) {
  if (!draggable || !ui.drag) return
  e.preventDefault()
  void dropOnBookmark(b)
}
function onDragEnd() {
  ui.drag = ui.over = ui.overFolder = null
}
</script>

<template>
  <a
    v-if="settings.density === 'tiles'"
    :href="b.url"
    class="group relative flex h-[108px] flex-col justify-between overflow-hidden rounded-xl border bg-card p-[13px] shadow-tile outline-offset-2 focus-visible:outline-2 focus-visible:outline-mfg motion:transition-[border-color]"
    :class="[
      'border-border hover:border-accent2',
      ui.drag === b.id && 'opacity-40',
      dropping && 'outline-2 outline-mfg',
    ]"
    @click="onBookmarkClick($event, b)"
    @auxclick="onBookmarkClick($event, b)"
    @contextmenu="onContext"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <div class="glow-tile" :style="glow"></div>
    <div class="relative flex items-start justify-between">
      <FavIcon :b="b" :size="36" />
      <Icon v-if="pinned" name="pin" :size="13" :stroke="2" class="m-1 text-mfg group-hover:hidden" />
      <button
        type="button"
        aria-label="More"
        class="-mt-1 -mr-1 hidden size-[26px] place-items-center rounded-md bg-card text-mfg group-hover:grid group-focus-visible:grid hover:bg-accent2 hover:text-fg"
        @click="onMore"
      >
        <Icon name="ellipsis" />
      </button>
    </div>
    <div class="relative min-w-0">
      <div class="truncate text-[13px] font-medium">{{ b.title }}</div>
      <div class="mt-px truncate text-[11.5px] text-mfg">{{ b.host }}</div>
    </div>
  </a>

  <a
    v-else-if="settings.density === 'list'"
    :href="b.url"
    class="group relative flex h-10 items-center gap-2.5 overflow-hidden rounded-lg pr-1.5 pl-2.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-mfg"
    :class="[ui.drag === b.id && 'opacity-40', dropping && 'outline-2 outline-mfg']"
    @click="onBookmarkClick($event, b)"
    @auxclick="onBookmarkClick($event, b)"
    @contextmenu="onContext"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <div class="glow-row" :style="glow"></div>
    <FavIcon :b="b" :size="22" />
    <div class="relative min-w-0 flex-[0_1_auto] truncate text-[13.5px] font-medium">{{ b.title }}</div>
    <Icon v-if="pinned" name="pin" :size="12" :stroke="2" class="relative text-mfg" />
    <div class="relative min-w-0 flex-1 truncate text-[12.5px] text-mfg">{{ b.host }}</div>
    <div class="relative font-mono text-[11px] whitespace-nowrap text-mfg group-hover:hidden">
      {{ metaText(b, meta) }}
    </div>
    <button
      type="button"
      aria-label="More"
      class="relative hidden size-7 place-items-center rounded-md text-mfg group-hover:grid hover:bg-accent2 hover:text-fg"
      @click="onMore"
    >
      <Icon name="ellipsis" />
    </button>
  </a>

  <a
    v-else
    :href="b.url"
    class="-mx-1.5 flex h-[30px] items-center gap-2.5 rounded-md px-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-mfg"
    :class="[ui.drag === b.id && 'opacity-40', dropping && 'outline-2 outline-mfg']"
    @click="onBookmarkClick($event, b)"
    @auxclick="onBookmarkClick($event, b)"
    @contextmenu="onContext"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <FavIcon :b="b" :size="16" />
    <div class="min-w-0 flex-[0_1_auto] truncate text-[13.5px]">{{ b.title }}</div>
    <Icon v-if="pinned" name="pin" :size="11" :stroke="2" class="text-mfg" />
  </a>
</template>
