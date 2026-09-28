<script setup lang="ts" vapor>
import { computed } from 'vue'
import { loaded, model } from '@/core/bookmarks'
import { modKey } from '@/core/platform'
import { local, settings } from '@/core/settings'
import { RECO, go, sections } from '@/core/view'
import Header from './Header.vue'
import Item from './Item.vue'

const empty = computed(() => local.view !== RECO && sections.value.every((s) => !s.items.length))
const gridClass = computed(
  () =>
    ({
      tiles: 'grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-2.5',
      list: 'grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-4 gap-y-0.5',
      columns: 'flex flex-col',
    })[settings.density],
)
</script>

<template>
  <main class="h-screen min-w-0 overflow-auto">
    <Header />
    <div class="px-9 pt-1.5 pb-20" :class="settings.density === 'columns' && 'columns-[270px] gap-x-9'">
      <section
        v-for="s in sections"
        :key="s.key"
        class="sec break-inside-avoid"
        :class="settings.density === 'columns' ? 'pb-7' : 'pb-[34px]'"
      >
        <div class="mb-3 flex items-baseline gap-1.5">
          <span v-if="s.path" class="text-[13px] text-mfg">{{ s.path }} /</span>
          <button
            v-if="s.folderId && s.folderId !== local.view"
            type="button"
            class="text-[13px] font-semibold hover:underline hover:underline-offset-[3px]"
            @click="go(s.folderId!)"
          >
            {{ s.title }}
          </button>
          <button
            v-else-if="s.key === RECO"
            type="button"
            class="text-[13px] font-semibold hover:underline hover:underline-offset-[3px]"
            @click="go(RECO)"
          >
            {{ s.title }}
          </button>
          <span v-else class="text-[13px] font-semibold">{{ s.title }}</span>
          <span class="ml-1 font-mono text-[11px] text-mfg">{{ s.items.length || '' }}</span>
        </div>
        <div v-if="s.items.length" :class="gridClass">
          <Item v-for="b in s.items" :key="b.id" :b="b" :meta="s.meta" :draggable="s.draggable" />
        </div>
        <p v-else-if="s.empty" class="py-6 text-[13px] text-mfg">{{ s.empty }}</p>
      </section>

      <div v-if="empty && loaded" class="py-20 text-center text-[13.5px] text-mfg">
        {{
          model.bookmarks.size
            ? 'This folder is empty. Drag bookmarks here from any section.'
            : `No bookmarks yet. Bookmark a page with ${modKey}D and it shows up here.`
        }}
      </div>
    </div>
  </main>
</template>
