<script setup lang="ts" vapor>
import { computed, ref } from 'vue'
import { modKey } from '@/core/platform'
import { local, settings } from '@/core/settings'
import { SORTS } from '@/core/sort'
import { ui } from '@/core/ui'
import { historyGranted } from '@/core/usage'
import { CLEAN, RECO, crumbs, go, title, total } from '@/core/view'
import Icon from './Icon.vue'
import Segmented from './Segmented.vue'

const sortEl = ref<HTMLElement>()
function placeSort(e: Event) {
  const el = e.target as HTMLElement
  const r = sortEl.value?.getBoundingClientRect()
  if (!r) return
  el.style.top = `${r.bottom + 6}px`
  el.style.left = `${Math.max(8, r.right - 232)}px`
}

const sortLabel = computed(() => SORTS.find(([k]) => k === settings.sort)?.[1])
const isReco = computed(() => local.view === RECO)
const isClean = computed(() => local.view === CLEAN)
const usesHistory = computed(() => settings.history && historyGranted.value)

const DENSITIES = [
  ['tiles', 'Tiles', 'layout-grid'],
  ['list', 'List', 'list'],
  ['columns', 'Columns', 'columns-3'],
] as const
</script>

<template>
  <header class="sticky top-0 z-[5] bg-bg px-9 pt-[22px] pb-[18px]">
    <div class="wrap flex flex-wrap items-end justify-between gap-6">
      <div class="min-w-0">
        <div class="flex h-[18px] items-center gap-1.5 text-[12.5px] text-mfg">
          <template v-for="c in crumbs" :key="c.id">
            <button type="button" class="hover:text-fg" @click="go(c.id)">{{ c.title }}</button>
            <span class="opacity-50">/</span>
          </template>
        </div>
        <div class="mt-1 flex items-baseline gap-2.5">
          <h1 class="m-0 text-2xl font-semibold tracking-[-0.025em]">{{ title }}</h1>
          <span class="font-mono text-xs text-mfg">{{ total }}</span>
        </div>
        <div v-if="isClean" class="mt-1.5 text-[13px] text-mfg">
          Copies are matched by URL, ignoring www, trailing slashes and utm tags. Pinned bookmarks are never listed as
          old.
        </div>
        <div v-if="isReco" class="mt-1.5 text-[13px] text-mfg">
          {{
            usesHistory
              ? 'Ranked by your clicks, browsing history of the last 5 days, and newly added bookmarks.'
              : 'Ranked by your clicks here, recency and newly added bookmarks.'
          }}
          <button
            v-if="!usesHistory"
            type="button"
            class="text-fg underline underline-offset-[3px]"
            @click="ui.settings = true"
          >
            Include browsing history
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-[34px] w-[280px] cursor-text items-center gap-2 rounded-lg border border-border bg-side pr-1.5 pl-2.5 text-[13.5px] text-mfg hover:border-accent2"
          @click="ui.palette = true"
        >
          <Icon name="search" />
          <span class="flex-1 text-left">Search bookmarks</span>
          <kbd class="rounded-[5px] border border-border bg-bg px-1.5 py-0.5 font-mono text-[11px]">{{ modKey }}K</kbd>
        </button>

        <template v-if="!isReco">
          <button
            type="button"
            popovertarget="sort-menu"
            class="flex h-[34px] items-center gap-[7px] rounded-lg border border-border px-[11px] text-[13.5px] hover:bg-accent"
            ref="sortEl"
          >
            <Icon name="arrow-down-up" class="text-mfg" />
            {{ sortLabel }}
          </button>
          <div
            id="sort-menu"
            popover
            @beforetoggle="placeSort"
            class="fixed w-[232px] rounded-[10px] bg-pop p-1 shadow-pop motion:animate-pop"
          >
            <div class="px-2 pt-1.5 pb-1 text-[11.5px] font-medium text-mfg">Sort by</div>
            <button
              v-for="[key, label] in SORTS"
              :key="key"
              type="button"
              class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13.5px] hover:bg-accent"
              @click="settings.sort = key"
            >
              <Icon name="check" :size="14" :stroke="2.25" :class="settings.sort === key ? '' : 'opacity-0'" />
              {{ label }}
            </button>
            <div class="-mx-1 my-1 h-px bg-border"></div>
            <div class="m-1">
              <Segmented
                v-model="settings.dir"
                size="sm"
                class="grid! grid-cols-2"
                :options="[
                  ['asc', 'Ascending'],
                  ['desc', 'Descending'],
                ]"
              />
            </div>
            <p class="px-2 py-1.5 text-[11.5px] leading-[1.45] text-pretty text-mfg">
              {{
                settings.sort === 'browser'
                  ? 'Drag bookmarks to reorder, or drop them on a folder in the sidebar.'
                  : 'Switch to Browser order to reorder by dragging. Pinned stay on top.'
              }}
            </p>
          </div>
        </template>

        <div class="flex h-[34px] gap-0.5 rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Layout">
          <button
            v-for="[value, label, icon] in DENSITIES"
            :key="value"
            type="button"
            role="radio"
            :title="label"
            :aria-checked="settings.density === value"
            class="grid w-[30px] place-items-center rounded-md"
            :class="settings.density === value ? 'bg-accent2 text-fg' : 'text-mfg hover:text-fg'"
            @click="settings.density = value"
          >
            <Icon :name="icon" />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
