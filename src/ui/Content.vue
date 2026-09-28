<script setup lang="ts" vapor>
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { loaded, model } from '@/core/bookmarks'
import { colorFor, iconSrc, iconsReady, onIconError, onIconLoad } from '@/core/favicon'
import { modKey } from '@/core/platform'
import { local, settings } from '@/core/settings'
import type { Bookmark } from '@/core/tree'
import { deleteBookmark, dropOnBookmark, onBookmarkClick, runCleanup, ui } from '@/core/ui'
import { CLEAN, RECO, go, isPinned, metaText, sections, type Section } from '@/core/view'
import { initWarmup } from '@/core/warm'
import Header from './Header.vue'

const main = useTemplateRef<HTMLElement>('main')
const wrap = useTemplateRef<HTMLElement>('wrap')
const columns = computed(() => settings.density === 'columns')
const empty = computed(
  () => local.view !== RECO && local.view !== CLEAN && sections.value.every((s) => !s.items.length),
)

const src = (b: Bookmark) => (iconsReady.value ? iconSrc(b) : null)
const letter = (b: Bookmark) => (iconsReady.value ? (b.title.trim()[0] ?? b.host[0] ?? '?').toUpperCase() : '')
const tint = (b: Bookmark) => (iconsReady.value ? colorFor(b.host) : 'var(--accent)')
const glow = (b: Bookmark) => ({ '--c': colorFor(b.host) })

const FIRST_PAINT = 240
const shown = shallowRef(new Set<string>())
const width = shallowRef(1000)

function topUp(from = shown.value) {
  const out = new Set(from)
  let budget = FIRST_PAINT
  for (const s of sections.value) {
    if (budget <= 0) break
    out.add(s.key)
    budget -= s.items.length
  }
  if (out.size !== shown.value.size || from !== shown.value) shown.value = out
}
watch(
  () => [local.view, settings.density],
  () => topUp(new Set()),
  { immediate: true },
)
watch(sections, () => topUp())

function estimate(s: Section): number {
  const n = s.items.length
  if (settings.density === 'columns') return n * 30
  const [min, gap, row, rowGap] = settings.density === 'tiles' ? [136, 10, 108, 10] : [256, 16, 40, 2]
  const cols = Math.max(1, Math.floor((width.value + gap) / (min + gap)))
  const rows = Math.ceil(n / cols)
  return rows * row + (rows - 1) * rowGap
}

let io: IntersectionObserver | undefined
let ro: ResizeObserver | undefined
function observe() {
  if (!io || !main.value) return
  for (const el of main.value.querySelectorAll<HTMLElement>('section[data-lazy]')) io.observe(el)
}
watch(sections, () => nextTick(observe), { flush: 'post' })
watch(shown, () => nextTick(observe), { flush: 'post' })

let stopWarm: (() => void) | undefined
watch(
  () => settings.warmup && main.value,
  (el) => {
    stopWarm?.()
    stopWarm = el ? initWarmup(el) : undefined
  },
  { immediate: true },
)

const bookmarkOf = (t: EventTarget | null) => {
  const a = t instanceof Element ? t.closest<HTMLElement>('a[data-bid]') : null
  const b = a ? model.value.bookmarks.get(a.dataset.bid!) : undefined
  return a && b ? { a, b } : null
}
const dnd = (a: HTMLElement) => !!a.closest('[data-dnd]')

function onImg(e: Event) {
  const img = e.target
  if (!(img instanceof HTMLImageElement)) return
  const hit = bookmarkOf(img)
  if (!hit) return
  if (e.type === 'load') void onIconLoad(hit.b, img)
  else onIconError(hit.b)
}

onMounted(() => {
  const root = main.value!
  root.addEventListener('load', onImg, true)
  root.addEventListener('error', onImg, true)
  io = new IntersectionObserver(
    (entries) => {
      const add = entries.filter((e) => e.isIntersecting).map((e) => (e.target as HTMLElement).dataset.key!)
      if (!add.length) return
      for (const e of entries) if (e.isIntersecting) io!.unobserve(e.target)
      shown.value = new Set([...shown.value, ...add])
    },
    { root, rootMargin: '1200px 0px' },
  )
  ro = new ResizeObserver(([e]) => (width.value = e!.contentRect.width))
  if (wrap.value) ro.observe(wrap.value)
  observe()
})
onUnmounted(() => {
  stopWarm?.()
  io?.disconnect()
  ro?.disconnect()
})

function openMenu(b: Bookmark, x: number, y: number) {
  ui.menu = { kind: 'bookmark', id: b.id, x, y }
}

function onClick(e: MouseEvent) {
  const hit = bookmarkOf(e.target)
  if (!hit) return
  const more = (e.target as Element).closest('button[data-more]')
  if (more) {
    e.preventDefault()
    const r = more.getBoundingClientRect()
    openMenu(hit.b, r.left, r.bottom + 4)
    return
  }
  onBookmarkClick(e, hit.b)
}
function onContext(e: MouseEvent) {
  const hit = bookmarkOf(e.target)
  if (!hit) return
  e.preventDefault()
  openMenu(hit.b, e.clientX, e.clientY)
}

let dragEl: HTMLElement | null = null
let overEl: HTMLElement | null = null
function setOver(el: HTMLElement | null) {
  if (overEl === el) return
  overEl?.classList.remove('outline-2', 'outline-mfg')
  overEl = el
  el?.classList.add('outline-2', 'outline-mfg')
}
function onDragStart(e: DragEvent) {
  const hit = bookmarkOf(e.target)
  if (!hit || !dnd(hit.a)) return
  e.dataTransfer!.effectAllowed = 'copyMove'
  ui.drag = hit.b.id
  dragEl = hit.a
  dragEl.classList.add('opacity-40')
}
function onDragOver(e: DragEvent) {
  const hit = bookmarkOf(e.target)
  if (!hit || !ui.drag || !dnd(hit.a)) return setOver(null)
  e.preventDefault()
  ui.over = hit.b.id
  setOver(hit.b.id === ui.drag ? null : hit.a)
}
function onDrop(e: DragEvent) {
  const hit = bookmarkOf(e.target)
  if (!hit || !ui.drag || !dnd(hit.a)) return
  e.preventDefault()
  setOver(null)
  void dropOnBookmark(hit.b)
}
function onDragEnd() {
  dragEl?.classList.remove('opacity-40')
  dragEl = null
  setOver(null)
  ui.drag = ui.over = ui.overFolder = null
}

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
    const d = along + Math.abs(dx ? y : x) * 3
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
  const hit = bookmarkOf(e.target)
  if (!hit || e.metaKey || e.ctrlKey || e.altKey) return
  const { a: el, b } = hit
  const dir = ARROWS[e.key]
  if (dir) {
    e.preventDefault()
    focusItem(nearest(el, dir))
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    const all = items()
    focusItem(e.key === 'Home' ? all[0] : all.at(-1))
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    e.stopPropagation()
    const all = items()
    const i = all.indexOf(el)
    const next = all[i + 1] ?? all[i - 1]
    void deleteBookmark(b).then(() => requestAnimationFrame(() => focusItem(next)))
  } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault()
    const r = el.getBoundingClientRect()
    openMenu(b, r.left + 12, r.bottom + 4)
  }
}
</script>

<template>
  <main
    ref="main"
    class="h-screen min-w-0 overflow-auto"
    @keydown="onKey"
    @click="onClick"
    @auxclick="onClick"
    @contextmenu="onContext"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <Header />
    <div class="px-9 pt-1.5 pb-20">
      <div ref="wrap" class="wrap" :class="columns && 'columns-[260px] gap-x-9'">
        <section
          v-for="s in sections"
          :key="s.key"
          :data-key="s.key"
          :data-lazy="shown.has(s.key) ? undefined : ''"
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
              class="ml-auto h-7 flex-none self-center rounded-md border border-border px-2.5 text-[12.5px] font-medium whitespace-nowrap hover:bg-accent"
              @click="runCleanup(s.action!.kind)"
            >
              {{ s.action.label }}
            </button>
          </div>

          <p v-if="!s.items.length" class="py-6 text-[13px] text-mfg" :class="columns && 'px-2'">{{ s.empty }}</p>
          <div v-else-if="!shown.has(s.key)" :style="{ height: estimate(s) + 'px' }"></div>
          <div
            v-else-if="settings.density === 'tiles'"
            class="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-2.5"
            :data-dnd="s.draggable ? '' : undefined"
          >
            <a
              v-for="b in s.items"
              :key="b.id"
              :href="b.url"
              :data-bid="b.id"
              class="group relative flex h-[108px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-[13px] shadow-tile outline-offset-2 hover:border-accent2 focus-visible:outline-2 focus-visible:outline-mfg motion:transition-[border-color]"
            >
              <div class="glow-tile" :style="glow(b)"></div>
              <div class="relative flex items-start justify-between">
                <span
                  class="relative grid size-9 flex-none place-items-center rounded-[9px] text-base font-semibold"
                  :class="
                    src(b)
                      ? 'bg-accent shadow-[inset_0_0_0_1px_var(--border)]'
                      : 'text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]'
                  "
                  :style="src(b) ? undefined : { background: tint(b) }"
                  ><img
                    class="size-6"
                    alt=""
                    decoding="async"
                    loading="lazy"
                    draggable="false"
                    :src="src(b) ?? undefined"
                    :hidden="!src(b)"
                  />{{ src(b) ? '' : letter(b) }}</span
                >
                <svg
                  v-show="isPinned(b)"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                  class="m-1 flex-none text-mfg group-hover:hidden"
                >
                  <use href="#i-pin" />
                </svg>
                <button
                  type="button"
                  aria-label="More"
                  data-more
                  class="-mt-1 -mr-1 hidden size-[26px] place-items-center rounded-md bg-card text-mfg group-hover:grid group-focus-visible:grid hover:bg-accent2 hover:text-fg"
                >
                  <svg
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <use href="#i-ellipsis" />
                  </svg>
                </button>
              </div>
              <div class="relative min-w-0">
                <div class="truncate text-[13px] font-medium">{{ b.title }}</div>
                <div class="mt-px truncate text-[11.5px] text-mfg">{{ b.host }}</div>
              </div>
            </a>
          </div>
          <div
            v-else-if="settings.density === 'list'"
            class="grid grid-cols-[repeat(auto-fill,minmax(256px,1fr))] gap-x-4 gap-y-0.5"
            :data-dnd="s.draggable ? '' : undefined"
          >
            <a
              v-for="b in s.items"
              :key="b.id"
              :href="b.url"
              :data-bid="b.id"
              class="group relative flex h-10 items-center gap-2.5 overflow-hidden rounded-lg pr-1.5 pl-2.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-mfg"
            >
              <div class="glow-row" :style="glow(b)"></div>
              <span
                class="relative grid size-[22px] flex-none place-items-center rounded-md text-[11px] font-semibold"
                :class="src(b) ? '' : 'text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]'"
                :style="src(b) ? undefined : { background: tint(b) }"
                ><img
                  class="size-4"
                  alt=""
                  decoding="async"
                  loading="lazy"
                  draggable="false"
                  :src="src(b) ?? undefined"
                  :hidden="!src(b)"
                />{{ src(b) ? '' : letter(b) }}</span
              >
              <div class="relative min-w-0 flex-[0_1_auto] truncate text-[13.5px] font-medium">{{ b.title }}</div>
              <svg
                v-show="isPinned(b)"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                class="relative flex-none text-mfg"
              >
                <use href="#i-pin" />
              </svg>
              <div class="relative min-w-0 flex-1 truncate text-[12.5px] text-mfg">{{ b.host }}</div>
              <div class="relative font-mono text-[11px] whitespace-nowrap text-mfg group-hover:hidden">
                {{ metaText(b, s.meta) }}
              </div>
              <button
                type="button"
                aria-label="More"
                data-more
                class="relative hidden size-7 place-items-center rounded-md text-mfg group-hover:grid hover:bg-accent2 hover:text-fg"
              >
                <svg
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <use href="#i-ellipsis" />
                </svg>
              </button>
            </a>
          </div>
          <div v-else :data-dnd="s.draggable ? '' : undefined">
            <a
              v-for="b in s.items"
              :key="b.id"
              :href="b.url"
              :data-bid="b.id"
              class="group relative flex h-[30px] break-inside-avoid items-center gap-2.5 rounded-md pr-1 pl-2 focus-visible:outline-2 focus-visible:outline-mfg"
              :style="glow(b)"
            >
              <div class="hov"></div>
              <span
                class="relative grid size-4 flex-none place-items-center rounded-[4px] text-[9.5px] font-semibold"
                :class="src(b) ? '' : 'text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]'"
                :style="src(b) ? undefined : { background: tint(b) }"
                ><img
                  class="size-4"
                  alt=""
                  decoding="async"
                  loading="lazy"
                  draggable="false"
                  :src="src(b) ?? undefined"
                  :hidden="!src(b)"
                />{{ src(b) ? '' : letter(b) }}</span
              >
              <div class="relative min-w-0 flex-[0_1_auto] truncate text-[13.5px]">{{ b.title }}</div>
              <svg
                v-show="isPinned(b)"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                class="relative flex-none text-mfg"
              >
                <use href="#i-pin" />
              </svg>
              <button
                type="button"
                aria-label="More"
                data-more
                class="relative ml-auto hidden size-[22px] flex-none place-items-center rounded text-mfg group-hover:grid hover:text-fg"
              >
                <svg
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <use href="#i-ellipsis" />
                </svg>
              </button>
            </a>
          </div>
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
