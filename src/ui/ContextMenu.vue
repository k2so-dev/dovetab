<script setup lang="ts" vapor>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { model } from '@/core/bookmarks'
import { isFirefox, modKey } from '@/core/platform'
import { descendants, flatFolders } from '@/core/tree'
import {
  copyLink,
  deleteBookmark,
  deleteFolder,
  editBookmark,
  hideBookmark,
  moveTo,
  newBookmark,
  newFolder,
  openBookmark,
  openFolder,
  refreshBookmarkIcon,
  renameFolder,
  togglePin,
  ui,
} from '@/core/ui'
import { isPinned } from '@/core/view'
import FavIcon from './FavIcon.vue'
import Icon from './Icon.vue'
import type { IconName } from './icons.gen'

interface Entry {
  label: string
  icon: IconName
  kbd?: string
  key?: string
  run?: () => unknown
  sub?: boolean
  danger?: boolean
  sep?: boolean
}

const el = ref<HTMLElement>()
const pos = reactive({ x: 0, y: 0, subX: 0, subY: 0 })
const sub = ref(false)

const bm = computed(() => (ui.menu?.kind === 'bookmark' ? model.value.bookmarks.get(ui.menu.id) : undefined))
const folder = computed(() => (ui.menu?.kind === 'folder' ? model.value.folders.get(ui.menu.id) : undefined))

const entries = computed<Entry[]>(() => {
  const b = bm.value
  if (b)
    return [
      {
        label: 'Open in new tab',
        icon: 'square-arrow-out-up-right',
        kbd: '↵',
        run: () => ((ui.menu = null), openBookmark(b, 'tab')),
      },
      { label: 'Open in new window', icon: 'app-window', run: () => ((ui.menu = null), openBookmark(b, 'window')) },
      { label: 'Open in incognito', icon: 'eye-off', run: () => ((ui.menu = null), openBookmark(b, 'incognito')) },
      { label: 'Copy link', icon: 'link', kbd: `${modKey}C`, key: 'c', run: () => copyLink(b), sep: true },
      { label: 'Edit…', icon: 'pencil', kbd: 'E', key: 'e', run: () => editBookmark(b) },
      {
        label: isPinned(b) ? 'Unpin' : 'Pin to top',
        icon: isPinned(b) ? 'pin-off' : 'pin',
        kbd: 'P',
        key: 'p',
        run: () => togglePin(b),
      },
      { label: 'Hide', icon: 'eye-off', kbd: 'H', key: 'h', run: () => hideBookmark(b) },
      { label: 'Refresh icon', icon: 'globe', run: () => refreshBookmarkIcon(b) },
      { label: 'Move to', icon: 'folder-input', kbd: '›', key: 'ArrowRight', sub: true },
      {
        label: 'Delete',
        icon: 'trash-2',
        kbd: '⌫',
        key: 'Backspace',
        run: () => deleteBookmark(b),
        danger: true,
        sep: true,
      },
    ]
  const f = folder.value
  if (!f) return []
  const m = model.value
  const n = descendants(m, f.id).reduce((a, id) => a + m.folders.get(id)!.bookmarks.length, 0)
  const out: Entry[] = [
    { label: `Open all (${n}) in new tabs`, icon: 'square-arrow-out-up-right', run: () => openFolder(f, 'tab') },
    { label: 'Open all in new window', icon: 'app-window', run: () => openFolder(f, 'window') },
    { label: 'Open all in incognito', icon: 'eye-off', run: () => openFolder(f, 'incognito') },
  ]
  if (!isFirefox) out.push({ label: 'Open all in tab group', icon: 'layers', run: () => openFolder(f, 'group') })
  out.push(
    { label: 'New bookmark…', icon: 'bookmark-plus', key: 'n', kbd: 'N', run: () => newBookmark(f.id), sep: true },
    { label: 'New folder…', icon: 'folder-plus', run: () => newFolder(f.id) },
  )
  if (!f.locked) {
    out.push(
      { label: 'Rename…', icon: 'pencil', kbd: 'E', key: 'e', run: () => renameFolder(f) },
      {
        label: 'Delete',
        icon: 'trash-2',
        kbd: '⌫',
        key: 'Backspace',
        run: () => deleteFolder(f),
        danger: true,
        sep: true,
      },
    )
  }
  return out
})

const targets = computed(() => flatFolders(model.value))

watch(
  () => ui.menu,
  async (menu) => {
    sub.value = false
    if (!menu) return
    pos.x = menu.x
    pos.y = menu.y
    await nextTick()
    const r = el.value?.getBoundingClientRect()
    if (!r) return
    pos.x = Math.max(8, Math.min(menu.x, innerWidth - r.width - 8))
    pos.y = Math.max(8, Math.min(menu.y, innerHeight - r.height - 8))
    el.value?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  },
)

function openSub(e: Event) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const W = 214
  pos.subX = r.right + 4 + W > innerWidth ? r.left - W - 4 : r.right + 4
  pos.subY = Math.max(8, Math.min(r.top - 4, innerHeight - 330))
  sub.value = true
}

function onKey(e: KeyboardEvent) {
  const items = [...(el.value?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
  const i = items.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    const d = e.key === 'ArrowDown' ? 1 : -1
    items[(i + d + items.length) % items.length]?.focus()
    return
  }
  if (e.altKey || e.ctrlKey || (e.metaKey && e.key !== 'c')) return
  const hit = entries.value.find((x) => x.key && x.key.toLowerCase() === e.key.toLowerCase())
  if (!hit) return
  e.preventDefault()
  e.stopPropagation()
  if (hit.sub) {
    const moveEl = items.find((x) => x.dataset.sub)
    if (moveEl) openSub({ currentTarget: moveEl } as unknown as Event)
  } else hit.run?.()
}

function close(e?: Event) {
  e?.preventDefault()
  ui.menu = null
}
</script>

<template>
  <template v-if="ui.menu && entries.length">
    <div class="fixed inset-0 z-40" @click="close" @contextmenu="close"></div>
    <div
      ref="el"
      role="menu"
      class="fixed z-41 w-[228px] rounded-[10px] bg-pop p-1 shadow-pop motion:animate-pop"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
      @keydown="onKey"
    >
      <div class="-mx-1 mb-1 flex items-center gap-2 border-b border-border pt-1.5 pr-2 pb-2 pl-3">
        <FavIcon v-if="bm" :b="bm" :size="18" />
        <Icon v-else name="folder" :size="16" class="text-mfg" />
        <div class="truncate text-[12.5px] font-medium">{{ bm?.title ?? folder?.title }}</div>
      </div>
      <template v-for="m in entries" :key="m.label">
        <div v-if="m.sep" class="-mx-1 my-1 h-px bg-border"></div>
        <button
          type="button"
          role="menuitem"
          :data-sub="m.sub ? '1' : undefined"
          class="flex h-8 w-full items-center gap-[9px] rounded-md px-2 text-left text-[13.5px] outline-none hover:bg-accent focus-visible:bg-accent"
          :class="[m.danger && 'text-danger', m.sub && sub && 'bg-accent']"
          @mouseenter="m.sub ? openSub($event) : (sub = false)"
          @click="m.sub ? openSub($event) : m.run?.()"
        >
          <Icon :name="m.icon" :class="m.danger ? '' : 'text-mfg'" />
          <span class="flex-1">{{ m.label }}</span>
          <span class="font-mono text-[11px] text-mfg">{{ m.kbd }}</span>
        </button>
      </template>
    </div>

    <div
      v-if="sub && bm"
      role="menu"
      class="fixed z-42 max-h-80 w-[210px] overflow-auto rounded-[10px] bg-pop p-1 shadow-pop motion:animate-pop"
      :style="{ left: `${pos.subX}px`, top: `${pos.subY}px` }"
    >
      <button
        v-for="f in targets"
        :key="f.id"
        type="button"
        role="menuitem"
        class="flex h-[30px] w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] hover:bg-accent"
        :style="{ paddingLeft: `${8 + f.depth * 12}px` }"
        @click="moveTo(bm!, f.id)"
      >
        <Icon name="folder" :size="14" class="text-mfg" />
        <span class="flex-1 truncate">{{ f.title }}</span>
        <Icon name="check" :size="13" :stroke="2.25" :class="bm!.parentId === f.id ? '' : 'opacity-0'" />
      </button>
    </div>
  </template>
</template>
