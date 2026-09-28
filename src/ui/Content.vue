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
const pad = useTemplateRef<HTMLElement>('pad')
const more = useTemplateRef<HTMLButtonElement>('more')
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

function firstKeys(): Set<string> {
  const out = new Set<string>()
  let budget = FIRST_PAINT
  for (const s of sections.value) {
    if (budget <= 0) break
    out.add(s.key)
    budget -= s.items.length
  }
  return out
}
function topUp(from = shown.value) {
  const out = new Set([...from, ...firstKeys()])
  if (out.size !== shown.value.size || from !== shown.value) shown.value = out
}

const TRIM_AFTER = 5 * 60e3
let trimTimer: ReturnType<typeof setTimeout> | undefined
function trim() {
  const root = main.value
  if (!root) return
  const limit = root.getBoundingClientRect().bottom + 1200
  const first = firstKeys()
  const keep = new Set(shown.value)
  for (const el of root.querySelectorAll<HTMLElement>('section[data-key]')) {
    const k = el.dataset.key!
    if (!first.has(k) && el.getBoundingClientRect().top > limit) keep.delete(k)
  }
  if (keep.size < shown.value.size) shown.value = keep
}
function onVisibility() {
  clearTimeout(trimTimer)
  if (document.hidden) trimTimer = setTimeout(trim, TRIM_AFTER)
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
  document.addEventListener('visibilitychange', onVisibility)
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
  clearTimeout(trimTimer)
  document.removeEventListener('visibilitychange', onVisibility)
  stopWarm?.()
  io?.disconnect()
  ro?.disconnect()
})

const MORE: Record<string, [number, number]> = { tiles: [26, 9], list: [28, 6], columns: [22, 4] }
let hot: HTMLElement | null = null

function setHot(a: HTMLElement | null) {
  if (hot === a) return
  hot?.removeAttribute('data-hot')
  hot = a
  const btn = more.value
  if (!btn) return
  if (!a || !pad.value) {
    btn.hidden = true
    return
  }
  a.setAttribute('data-hot', '')
  const [size, inset] = MORE[settings.density] ?? MORE.list!
  const r = a.getBoundingClientRect()
  const p = pad.value.getBoundingClientRect()
  btn.style.top = `${r.top - p.top + inset}px`
  btn.style.left = `${r.right - p.left - inset - size}px`
  btn.hidden = false
}
function onOver(e: PointerEvent) {
  const t = e.target instanceof Element ? e.target : null
  if (t?.closest('button[data-more]')) return
  setHot(t?.closest<HTMLElement>('a[data-bid]') ?? null)
}
function onFocusIn(e: FocusEvent) {
  const a = e.target instanceof Element ? e.target.closest<HTMLElement>('a[data-bid]') : null
  if (a) setHot(a)
}
watch([sections, shown, () => settings.density], () => setHot(null))

function openMenu(b: Bookmark, x: number, y: number) {
  ui.menu = { kind: 'bookmark', id: b.id, x, y }
}

function onMore(e: MouseEvent): boolean {
  const btn = e.target instanceof Element ? e.target.closest('button[data-more]') : null
  if (!btn) return false
  e.preventDefault()
  const hit = bookmarkOf(hot)
  if (!hit || e.type !== 'click') return true
  const r = btn.getBoundingClientRect()
  openMenu(hit.b, r.left, r.bottom + 4)
  return true
}
function onClick(e: MouseEvent) {
  if (onMore(e)) return
  const hit = bookmarkOf(e.target)
  if (!hit) return
  onBookmarkClick(e, hit.b)
}
function onContext(e: MouseEvent) {
  const hit = bookmarkOf(e.target) ?? (onMore(e) ? bookmarkOf(hot) : null)
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
    @pointerover="onOver"
    @focusin="onFocusIn"
    @click="onClick"
    @auxclick="onClick"
    @contextmenu="onContext"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <Header />
    <div ref="pad" class="relative px-9 pt-1.5 pb-20" @pointerleave="setHot(null)">
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
              class="group relative flex h-[108px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-[13px] shadow-tile outline-offset-2 hover:border-accent2 focus-visible:outline-2 data-hot:border-accent2 focus-visible:outline-mfg motion:transition-[border-color]"
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
                <i
                  class="pin size-[13px] m-1 flex-none text-mfg group-hover:hidden group-data-hot:hidden"
                  :hidden="!isPinned(b)"
                ></i>
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
              class="group relative flex h-10 items-center gap-2.5 overflow-hidden rounded-lg pr-1.5 pl-2.5 hover:bg-accent hover:pr-11 data-hot:bg-accent data-hot:pr-11 focus-visible:outline-2 focus-visible:outline-mfg"
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
              <i class="pin size-[12px] relative flex-none text-mfg" :hidden="!isPinned(b)"></i>
              <div class="relative min-w-0 flex-1 truncate text-[12.5px] text-mfg">{{ b.host }}</div>
              <div
                class="relative font-mono text-[11px] whitespace-nowrap text-mfg group-hover:hidden group-data-hot:hidden"
              >
                {{ metaText(b, s.meta) }}
              </div>
            </a>
          </div>
          <div v-else :data-dnd="s.draggable ? '' : undefined">
            <a
              v-for="b in s.items"
              :key="b.id"
              :href="b.url"
              :data-bid="b.id"
              class="group relative flex h-[30px] break-inside-avoid items-center gap-2.5 rounded-md pr-1 pl-2 hover:pr-9 focus-visible:outline-2 data-hot:pr-9 focus-visible:outline-mfg"
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
              <i class="pin size-[11px] relative flex-none text-mfg" :hidden="!isPinned(b)"></i>
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
      <button
        ref="more"
        type="button"
        aria-label="More"
        data-more
        tabindex="-1"
        hidden
        class="absolute z-10 grid place-items-center text-mfg hover:text-fg"
        :class="
          settings.density === 'tiles'
            ? 'size-[26px] rounded-md bg-card hover:bg-accent2'
            : settings.density === 'list'
              ? 'size-7 rounded-md hover:bg-accent2'
              : 'size-[22px] rounded'
        "
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
  </main>
</template>
