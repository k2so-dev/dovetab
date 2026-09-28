<script setup lang="ts" vapor>
import { computed, onUnmounted, useTemplateRef, watch } from 'vue'
import { loaded, model } from '@/core/bookmarks'
import { modKey } from '@/core/platform'
import { local, settings } from '@/core/settings'
import { deleteBookmark, runCleanup, ui } from '@/core/ui'
import { CLEAN, RECO, go, sections } from '@/core/view'
import { initWarmup } from '@/core/warm'
import Header from './Header.vue'
import Item from './Item.vue'

const main = useTemplateRef<HTMLElement>('main')
const columns = computed(() => settings.density === 'columns')
const empty = computed(
  () => local.view !== RECO && local.view !== CLEAN && sections.value.every((s) => !s.items.length),
)
const gridClass = computed(
  () =>
    ({
      tiles: 'grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-2.5',
      list: 'grid grid-cols-[repeat(auto-fill,minmax(256px,1fr))] gap-x-4 gap-y-0.5',
      columns: '',
    })[settings.density],
)

let stopWarm: (() => void) | undefined
watch(
  () => settings.warmup && main.value,
  (el) => {
    stopWarm?.()
    stopWarm = el ? initWarmup(el) : undefined
  },
  { immediate: true },
)
onUnmounted(() => stopWarm?.())

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

function items(): HTMLElement[] {
  return [...(main.value?.querySelectorAll<HTMLElement>('a[data-bid]') ?? [])]
}

function nearest(from: HTMLElement, [dx, dy]: [number, number]): HTMLElement | undefined {
  const a = from.getBoundingClientRect()
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  let best: HTMLElement | undefined
  let bestD = Infinity
  for (const el of items()) {
    if (el === from) continue
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2 - ax
    const y = r.top + r.height / 2 - ay
    const along = x * dx + y * dy
    if (along <= 1) continue
    const across = Math.abs(dx ? y : x)
    const d = along + across * 3
    if (d < bestD) {
      bestD = d
      best = el
    }
  }
  return best
}

function focusItem(el: HTMLElement | undefined) {
  if (!el) return
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest' })
}

function onKey(e: KeyboardEvent) {
  const el = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('a[data-bid]') : null
  if (!el || e.metaKey || e.ctrlKey || e.altKey) return
  const b = model.value.bookmarks.get(el.dataset.bid!)
  const dir = ARROWS[e.key]
  if (dir) {
    e.preventDefault()
    focusItem(nearest(el, dir))
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    const all = items()
    focusItem(e.key === 'Home' ? all[0] : all.at(-1))
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && b) {
    e.preventDefault()
    e.stopPropagation()
    const all = items()
    const i = all.indexOf(el)
    const next = all[i + 1] ?? all[i - 1]
    void deleteBookmark(b).then(() => requestAnimationFrame(() => focusItem(next)))
  } else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && b) {
    e.preventDefault()
    const r = el.getBoundingClientRect()
    ui.menu = { kind: 'bookmark', id: b.id, x: r.left + 12, y: r.bottom + 4 }
  }
}
</script>

<template>
  <main ref="main" class="h-screen min-w-0 overflow-auto" @keydown="onKey">
    <Header />
    <div class="px-9 pt-1.5 pb-20">
      <div class="wrap" :class="columns && 'columns-[260px] gap-x-9'">
        <section
          v-for="s in sections"
          :key="s.key"
          class="sec"
          :class="columns ? ['pb-7', s.items.length <= 12 && 'break-inside-avoid'] : 'break-inside-avoid pb-[34px]'"
        >
          <div
            class="mb-3 flex items-baseline gap-1.5"
            :class="columns && 'mb-1.5 break-after-avoid break-inside-avoid px-2 pt-0.5'"
          >
            <span v-if="s.path" class="min-w-0 truncate text-[13px] text-mfg">{{ s.path }} /</span>
            <button
              v-if="s.folderId && s.folderId !== local.view"
              type="button"
              class="flex-none text-[13px] font-semibold hover:underline hover:underline-offset-[3px]"
              @click="go(s.folderId!)"
            >
              {{ s.title }}
            </button>
            <button
              v-else-if="s.key === RECO"
              type="button"
              class="flex-none text-[13px] font-semibold hover:underline hover:underline-offset-[3px]"
              @click="go(RECO)"
            >
              {{ s.title }}
            </button>
            <span v-else class="flex-none text-[13px] font-semibold">{{ s.title }}</span>
            <span class="ml-1 flex-none font-mono text-[11px] text-mfg">{{ s.items.length || '' }}</span>
            <button
              v-if="s.action"
              type="button"
              class="ml-auto h-7 flex-none self-center rounded-md whitespace-nowrap border border-border px-2.5 text-[12.5px] font-medium hover:bg-accent"
              @click="runCleanup(s.action!.kind)"
            >
              {{ s.action.label }}
            </button>
          </div>
          <div v-if="s.items.length" :class="gridClass">
            <Item v-for="b in s.items" :key="b.id" :b="b" :meta="s.meta" :draggable="s.draggable" />
          </div>
          <p v-else-if="s.empty" class="py-6 text-[13px] text-mfg" :class="columns && 'px-2'">{{ s.empty }}</p>
        </section>

        <div v-if="empty && loaded" class="py-20 text-center text-[13.5px] text-mfg">
          {{
            model.bookmarks.size
              ? 'This folder is empty. Drag bookmarks here from any section.'
              : `No bookmarks yet. Bookmark a page with ${modKey}D and it shows up here.`
          }}
        </div>
      </div>
    </div>
  </main>
</template>
