<script setup lang="ts" vapor>
import { computed } from 'vue'
import { model } from '@/core/bookmarks'
import { colorFor } from '@/core/favicon'
import { flatFolders, hostOf, type Bookmark } from '@/core/tree'
import { deleteBookmark, normalizeUrl, saveEdit, ui } from '@/core/ui'
import FavIcon from './FavIcon.vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'

let last: typeof ui.edit = null
const e = computed(() => (last = ui.edit ?? last))
const isFolder = computed(() => e.value?.mode === 'new-folder' || e.value?.mode === 'rename-folder')
const heading = computed(
  () =>
    ({ edit: 'Edit bookmark', new: 'New bookmark', 'new-folder': 'New folder', 'rename-folder': 'Rename folder' })[
      e.value?.mode ?? 'edit'
    ],
)
const folders = computed(() => flatFolders(model.value))
const original = computed(() => (e.value?.id ? model.value.bookmarks.get(e.value.id) : undefined))

const preview = computed<Bookmark>(() => {
  const url = normalizeUrl(e.value?.url ?? '')
  return {
    id: e.value?.id ?? 'new',
    parentId: e.value?.parentId ?? '',
    title: e.value?.title || 'Untitled',
    url,
    host: hostOf(url),
    dateAdded: 0,
    index: 0,
  }
})
const validUrl = computed(() => {
  try {
    return !!new URL(normalizeUrl(e.value?.url ?? ''))
  } catch {
    return false
  }
})
const canSave = computed(() => isFolder.value || validUrl.value)

function submit(ev: Event) {
  ev.preventDefault()
  if (canSave.value) void saveEdit()
}
</script>

<template>
  <Modal :open="!!ui.edit" @close="ui.edit = null">
    <form v-if="e" class="w-[min(460px,calc(100vw-32px))]" @submit="submit">
      <div class="flex items-center justify-between px-5 pt-[18px] pb-1">
        <div class="text-base font-semibold tracking-[-0.01em]">{{ heading }}</div>
        <button
          type="button"
          aria-label="Close"
          class="grid size-7 place-items-center rounded-md text-mfg hover:bg-accent hover:text-fg"
          @click="ui.edit = null"
        >
          <Icon name="x" :stroke="2" />
        </button>
      </div>

      <div class="flex flex-col gap-3.5 px-5 pt-3 pb-5">
        <div
          v-if="!isFolder"
          class="relative flex items-center gap-3 overflow-hidden rounded-[10px] border border-border p-3"
        >
          <div class="glow-tile opacity-100!" :style="{ '--c': colorFor(preview.host) }"></div>
          <FavIcon :b="preview" :size="36" />
          <div class="relative min-w-0">
            <div class="truncate text-[13.5px] font-medium">{{ preview.title }}</div>
            <div class="truncate text-xs text-mfg">{{ preview.host }}</div>
          </div>
        </div>

        <label class="flex flex-col gap-1.5 text-[12.5px] font-medium">
          Name
          <input
            v-model="e.title"
            autofocus
            class="h-9 rounded-lg border border-border bg-input px-[11px] text-[13.5px] font-normal text-fg outline-0 focus:border-mfg focus:shadow-[0_0_0_3px_var(--ring)]"
          />
        </label>
        <label v-if="!isFolder" class="flex flex-col gap-1.5 text-[12.5px] font-medium">
          URL
          <input
            v-model="e.url"
            spellcheck="false"
            class="h-9 rounded-lg border bg-input px-[11px] font-mono text-[12.5px] font-normal text-fg outline-0 focus:shadow-[0_0_0_3px_var(--ring)]"
            :class="validUrl ? 'border-border focus:border-mfg' : 'border-danger'"
          />
        </label>
        <label v-if="e.mode === 'edit' || e.mode === 'new'" class="flex flex-col gap-1.5 text-[12.5px] font-medium">
          Folder
          <select
            v-model="e.parentId"
            class="h-9 rounded-lg border border-border bg-input px-2 text-[13.5px] font-normal text-fg outline-0 focus:border-mfg"
          >
            <option v-for="f in folders" :key="f.id" :value="f.id">{{ '  '.repeat(f.depth) + f.title }}</option>
          </select>
        </label>
      </div>

      <div class="flex items-center gap-2 border-t border-border px-5 py-3.5">
        <button
          v-if="original"
          type="button"
          class="flex h-[34px] items-center rounded-lg px-3 text-[13.5px] text-danger hover:bg-accent"
          @click="deleteBookmark(original!)"
        >
          Delete
        </button>
        <div class="flex-1"></div>
        <button
          type="button"
          class="flex h-[34px] items-center rounded-lg border border-border px-3.5 text-[13.5px] font-medium hover:bg-accent"
          @click="ui.edit = null"
        >
          Cancel
        </button>
        <button
          type="submit"
          :disabled="!canSave"
          class="flex h-[34px] items-center rounded-lg bg-prim px-3.5 text-[13.5px] font-medium text-primfg hover:opacity-90 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  </Modal>
</template>
