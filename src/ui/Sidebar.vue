<script setup lang="ts" vapor>
import { model } from '@/core/bookmarks'
import { isDark, local, settings } from '@/core/settings'
import { dropOnFolder, ui } from '@/core/ui'
import { RECO, treeRows, type TreeRow } from '@/core/view'
import Icon from './Icon.vue'

function toggle(e: Event, r: TreeRow) {
  e.stopPropagation()
  if (r.hasKids) local.open[r.id] = !r.open
}

function onContext(e: MouseEvent, r: TreeRow) {
  if (!r.folder) return
  e.preventDefault()
  ui.menu = { kind: 'folder', id: r.id, x: e.clientX, y: e.clientY }
}

const canDrop = (r: TreeRow) => !!ui.drag && r.folder
function onDragOver(e: DragEvent, r: TreeRow) {
  if (!canDrop(r)) return
  e.preventDefault()
  ui.overFolder = r.id
}

function toggleTheme() {
  settings.theme = isDark() ? 'light' : 'dark'
}
</script>

<template>
  <aside class="flex min-h-0 flex-col border-r border-border bg-side">
    <div class="flex items-center gap-2.5 px-[18px] pt-[18px] pb-3.5">
      <div class="grid size-[22px] place-items-center rounded-md bg-fg text-bg">
        <Icon name="bookmark" :size="12" :stroke="3" />
      </div>
      <div class="text-sm font-semibold tracking-[-0.01em]">Shelf</div>
    </div>

    <nav class="flex min-h-0 flex-1 flex-col gap-px overflow-auto px-2 pt-1 pb-3" aria-label="Folders">
      <div
        v-for="(r, i) in treeRows"
        :key="r.id"
        role="button"
        tabindex="0"
        :aria-current="local.view === r.id ? 'page' : undefined"
        class="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md pr-2 select-none"
        :class="[
          local.view === r.id || ui.overFolder === r.id ? 'bg-accent2 font-medium' : 'hover:bg-accent',
          ui.overFolder === r.id && 'outline-1 outline-mfg outline-dashed',
          r.depth === 0 && r.folder && treeRows[i - 1] && !treeRows[i - 1]!.folder ? 'mt-2.5' : '',
          r.depth === 0 && r.folder && treeRows[i - 1]?.folder ? 'mt-1.5' : '',
        ]"
        :style="{ paddingLeft: `${4 + r.depth * 14}px` }"
        @click="local.view = r.id"
        @keydown.enter="local.view = r.id"
        @contextmenu="onContext($event, r)"
        @dragover="onDragOver($event, r)"
        @dragleave="ui.overFolder === r.id && (ui.overFolder = null)"
        @drop.prevent="canDrop(r) && dropOnFolder(r.id)"
      >
        <span
          class="grid size-4 place-items-center text-mfg"
          :class="r.hasKids ? '' : 'invisible'"
          @click="toggle($event, r)"
        >
          <Icon
            name="chevron-right"
            :size="12"
            :stroke="2.25"
            :class="['motion:transition-transform', r.open && 'rotate-90']"
          />
        </span>
        <Icon :name="r.icon" class="opacity-85" />
        <span class="min-w-0 flex-1 truncate text-[13.5px]">{{ r.title }}</span>
        <span class="font-mono text-[11px] text-mfg tabular-nums">{{ r.count }}</span>
      </div>
      <p v-if="!model.roots.length" class="px-2 py-3 text-[12.5px] text-mfg">Loading…</p>
    </nav>

    <div class="flex items-center gap-1 border-t border-border p-2.5">
      <button
        type="button"
        class="flex h-8 flex-1 items-center gap-2 rounded-[7px] px-2.5 text-[13.5px] text-mfg hover:bg-accent hover:text-fg"
        @click="ui.settings = true"
      >
        <Icon name="sliders-horizontal" />
        Settings
      </button>
      <button
        type="button"
        title="Toggle theme"
        class="grid size-8 place-items-center rounded-[7px] text-mfg hover:bg-accent hover:text-fg"
        @click="toggleTheme"
      >
        <Icon :name="isDark() ? 'sun' : 'moon'" />
      </button>
    </div>
  </aside>
</template>
