<script setup lang="ts" vapor>
import { computed, ref, shallowRef, watch } from 'vue'
import { model } from '@/core/bookmarks'
import { modKey, openUrl, webSearch } from '@/core/platform'
import { matchScore } from '@/core/search'
import { settings } from '@/core/settings'
import { ancestors, type Bookmark, type Folder } from '@/core/tree'
import { openBookmark, ui } from '@/core/ui'
import { searchHistory, usageOf } from '@/core/usage'
import { go, isHidden, scoreOf } from '@/core/view'
import FavIcon from './FavIcon.vue'
import Icon from './Icon.vue'
import Modal from './Modal.vue'

type Row =
  | { kind: 'header'; label: string }
  | { kind: 'bookmark'; b: Bookmark }
  | { kind: 'folder'; f: Folder; path: string }
  | { kind: 'history'; url: string; title: string; host: string }
  | { kind: 'web'; q: string }

const q = ref('')
const sel = ref(0)
const history = shallowRef<{ url: string; title: string; host: string }[]>([])
const list = ref<HTMLElement>()

watch(
  () => ui.palette,
  (open) => {
    if (open) {
      q.value = ui.seed
      ui.seed = ''
      sel.value = 0
    }
  },
)

let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (text) => {
  sel.value = 0
  clearTimeout(timer)
  if (!text.trim()) return void (history.value = [])
  timer = setTimeout(async () => {
    const known = new Set([...model.value.bookmarks.values()].map((b) => b.url))
    const items = await searchHistory(text.trim())
    history.value = items
      .filter((h) => !known.has(h.url!))
      .map((h) => ({ url: h.url!, title: h.title!, host: new URL(h.url!).host.replace(/^www\./, '') }))
  }, 80)
})

const rows = computed<Row[]>(() => {
  const m = model.value
  const text = q.value.trim()
  const all = [...m.bookmarks.values()].filter((b) => !isHidden(b))
  const out: Row[] = []
  if (!text) {
    const recent = all
      .filter((b) => usageOf(b.url).last > 0)
      .sort((a, b) => usageOf(b.url).last - usageOf(a.url).last)
      .slice(0, 6)
    const list = recent.length ? recent : all.sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 6)
    if (list.length) out.push({ kind: 'header', label: recent.length ? 'Recently opened' : 'Bookmarks' })
    list.forEach((b) => out.push({ kind: 'bookmark', b }))
    return out
  }
  const hits = all
    .map((b) => ({ b, s: matchScore(text, b.title, b.url) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s + scoreOf(b.b) * 0.3 - (a.s + scoreOf(a.b) * 0.3))
    .slice(0, 20)
  if (hits.length) {
    out.push({ kind: 'header', label: 'Bookmarks' })
    hits.forEach(({ b }) => out.push({ kind: 'bookmark', b }))
  }
  const folders = [...m.folders.values()]
    .map((f) => ({ f, s: matchScore(text, f.title, '') }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
  if (folders.length) {
    out.push({ kind: 'header', label: 'Folders' })
    folders.forEach(({ f }) =>
      out.push({
        kind: 'folder',
        f,
        path: ancestors(m, f.id)
          .map((a) => a.title)
          .join(' / '),
      }),
    )
  }
  if (history.value.length) {
    out.push({ kind: 'header', label: 'History' })
    history.value.forEach((h) => out.push({ kind: 'history', ...h }))
  }
  out.push({ kind: 'web', q: text })
  return out
})

const items = computed(() => rows.value.filter((r) => r.kind !== 'header'))
const folderName = (b: Bookmark) => model.value.folders.get(b.parentId)?.title ?? ''

function activate(r: Row | undefined, newTab: boolean) {
  if (!r) return
  const where = newTab ? 'tab' : undefined
  if (r.kind === 'bookmark') void openBookmark(r.b, where)
  else if (r.kind === 'folder') go(r.f.id)
  else if (r.kind === 'history') void openUrl(r.url, newTab || settings.newTab ? 'tab' : 'current')
  else if (r.kind === 'web') void webSearch(r.q, newTab || settings.newTab)
  ui.palette = false
}

function onKey(e: KeyboardEvent) {
  const n = items.value.length
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    sel.value = (sel.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    requestAnimationFrame(() => list.value?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }))
  } else if (e.key === 'Enter') {
    e.preventDefault()
    activate(items.value[sel.value], e.metaKey || e.ctrlKey)
  }
}
</script>

<template>
  <Modal :open="ui.palette" top @close="ui.palette = false">
    <div class="w-[min(620px,calc(100vw-32px))] overflow-hidden">
      <div class="flex h-[52px] items-center gap-2.5 border-b border-border px-4">
        <Icon name="search" :size="17" class="text-mfg" />
        <input
          v-model="q"
          autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          placeholder="Search bookmarks and folders…"
          class="h-full flex-1 border-0 bg-transparent text-[15px] text-fg outline-0 placeholder:text-mfg"
          @keydown="onKey"
        />
        <kbd class="rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[11px] text-mfg">esc</kbd>
      </div>

      <div id="palette-list" ref="list" role="listbox" class="max-h-[380px] overflow-auto p-1.5">
        <template v-for="(r, i) in rows" :key="i">
          <div v-if="r.kind === 'header'" class="px-2.5 pt-2.5 pb-1 text-[11.5px] font-medium text-mfg">
            {{ r.label }}
          </div>
          <div
            v-else
            role="option"
            :aria-selected="items[sel] === r"
            class="flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5"
            :class="items[sel] === r && 'bg-accent'"
            @mousemove="sel = items.indexOf(r)"
            @click="activate(r, $event.metaKey || $event.ctrlKey)"
          >
            <template v-if="r.kind === 'bookmark'">
              <FavIcon :b="r.b" :size="22" />
              <div class="min-w-0 flex-[0_1_auto] truncate text-[13.5px] font-medium">{{ r.b.title }}</div>
              <div class="min-w-0 flex-1 truncate text-[12.5px] text-mfg">{{ r.b.host }}</div>
              <div class="text-[11.5px] whitespace-nowrap text-mfg">{{ folderName(r.b) }}</div>
            </template>
            <template v-else-if="r.kind === 'folder'">
              <div class="grid size-[22px] flex-none place-items-center rounded-md bg-accent2">
                <Icon name="folder" :size="13" :stroke="2" />
              </div>
              <div class="min-w-0 flex-[0_1_auto] truncate text-[13.5px] font-medium">{{ r.f.title }}</div>
              <div class="flex-1"></div>
              <div class="text-[11.5px] whitespace-nowrap text-mfg">{{ r.path }}</div>
            </template>
            <template v-else-if="r.kind === 'history'">
              <div class="grid size-[22px] flex-none place-items-center rounded-md bg-accent2">
                <Icon name="history" :size="13" :stroke="2" />
              </div>
              <div class="min-w-0 flex-[0_1_auto] truncate text-[13.5px] font-medium">{{ r.title }}</div>
              <div class="min-w-0 flex-1 truncate text-[12.5px] text-mfg">{{ r.host }}</div>
            </template>
            <template v-else-if="r.kind === 'web'">
              <div class="grid size-[22px] flex-none place-items-center rounded-md bg-accent2">
                <Icon name="globe" :size="13" :stroke="2" />
              </div>
              <div class="min-w-0 truncate text-[13.5px]">Search the web for “{{ r.q }}”</div>
            </template>
          </div>
        </template>
        <div v-if="!items.length" class="py-9 text-center text-[13.5px] text-mfg">No bookmarks yet</div>
      </div>

      <div class="flex h-[38px] items-center gap-4 border-t border-border px-4 text-xs text-mfg">
        <span class="flex items-center gap-1.5">
          <kbd class="rounded border border-border px-[5px] py-px font-mono text-[11px]">↑↓</kbd>Navigate
        </span>
        <span class="flex items-center gap-1.5">
          <kbd class="rounded border border-border px-[5px] py-px font-mono text-[11px]">↵</kbd>Open
        </span>
        <span class="flex items-center gap-1.5">
          <kbd class="rounded border border-border px-[5px] py-px font-mono text-[11px]">{{ modKey }}↵</kbd>New tab
        </span>
      </div>
    </div>
  </Modal>
</template>
