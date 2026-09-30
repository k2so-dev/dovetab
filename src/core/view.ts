import { computed, shallowRef, watchEffect } from 'vue'
import { model } from './bookmarks'
import { score, ago } from './score'
import { local, settings } from './settings'
import { sortBookmarks, type SortCtx } from './sort'
import { ancestors, descendants, type Bookmark, type Folder } from './tree'
import { duplicates, stale } from './cleanup'
import { later } from './platform'
import { recent, recentOn, since, usageOf } from './usage'

export const ALL = 'all'
export const RECO = 'reco'
export const CLEAN = 'clean'

const NOW = Date.now()
const FRESH_DAYS = 7

export const pinSet = computed(() => new Set(settings.pins))
export const hiddenSet = computed(() => new Set(settings.hidden))
export const isPinned = (b: Bookmark) => pinSet.value.has(b.url)
export const isHidden = (b: Bookmark) => hiddenSet.value.has(b.url)

const scores = computed(() => {
  const m = new Map<string, number>()
  for (const b of model.value.bookmarks.values()) m.set(b.id, score(usageOf(b.url), b.dateAdded, NOW))
  return m
})
export const scoreOf = (b: Bookmark) => scores.value.get(b.id) ?? 0

const ctx: SortCtx = { usage: (b) => usageOf(b.url), score: scoreOf, pinned: isPinned }

export const counts = computed(() => {
  const m = model.value
  const out = new Map<string, number>()
  const count = (id: string): number => {
    const f = m.folders.get(id)!
    let n = f.bookmarks.reduce((a, bid) => a + (isHidden(m.bookmarks.get(bid)!) ? 0 : 1), 0)
    for (const c of f.folders) n += count(c)
    out.set(id, n)
    return n
  }
  m.roots.forEach(count)
  return out
})

export const totalCount = computed(() => model.value.roots.reduce((a, r) => a + (counts.value.get(r) ?? 0), 0))

export type Meta = 'ago' | 'usage' | 'added' | 'folder' | 'visited'

export interface Section {
  key: string
  title: string
  path: string
  items: Bookmark[]
  folderId?: string
  meta: Meta
  draggable: boolean
  empty?: string
  action?: { label: string; kind: 'dupes' | 'stale' }
}

export function metaText(b: Bookmark, meta: Meta): string {
  if (meta === 'folder') {
    const m = model.value
    const f = m.folders.get(b.parentId)
    return f ? [...ancestors(m, f.id).map((a) => a.title), f.title].join(' / ') : ''
  }
  if (meta === 'visited') return ago(b.dateAdded)
  const u = usageOf(b.url)
  if (meta === 'added') return `added ${ago(b.dateAdded, NOW)}`
  if (meta === 'usage') {
    const n = u.clicks + u.visits
    return n ? `${n}× · ${ago(u.last, NOW)}` : ''
  }
  return ago(u.last, NOW)
}

function visibleIn(f: Folder): Bookmark[] {
  const m = model.value
  return f.bookmarks.map((id) => m.bookmarks.get(id)!).filter((b) => !isHidden(b))
}

function recommended(limit: number): Bookmark[] {
  return [...model.value.bookmarks.values()]
    .filter((b) => !isHidden(b) && usageOf(b.url).clicks + usageOf(b.url).visits > 0)
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, limit)
}

function recentlyAdded(limit: number): Bookmark[] {
  return [...model.value.bookmarks.values()]
    .filter((b) => !isHidden(b) && NOW - b.dateAdded < FRESH_DAYS * 864e5)
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .slice(0, limit)
}

const cleanupReady = shallowRef(false)
later(() => (cleanupReady.value = true))
const cleanupOn = () => cleanupReady.value || local.view === CLEAN

export const dupeGroups = computed(() =>
  cleanupOn() ? duplicates([...model.value.bookmarks.values()].filter((b) => !isHidden(b))) : [],
)
export const staleItems = computed(() =>
  !cleanupOn()
    ? []
    : stale(
        [...model.value.bookmarks.values()].filter((b) => !isHidden(b) && !isPinned(b)),
        (b) => usageOf(b.url),
        NOW,
        since,
      ),
)
export const extraCopies = computed(() => dupeGroups.value.flatMap((g) => g.slice(1)))
const CLEANUP_KEY = 'dovetab:cleanup'
let cleanupSaved = Number(localStorage.getItem(CLEANUP_KEY)) || 0
export const cleanupCount = computed(() =>
  cleanupOn() ? extraCopies.value.length + staleItems.value.length : cleanupSaved,
)
watchEffect(() => {
  if (!cleanupOn() || cleanupCount.value === cleanupSaved) return
  cleanupSaved = cleanupCount.value
  localStorage.setItem(CLEANUP_KEY, String(cleanupSaved))
})

const same = (a: Section, b: Section) =>
  a.title === b.title &&
  a.path === b.path &&
  a.meta === b.meta &&
  a.draggable === b.draggable &&
  a.empty === b.empty &&
  a.action?.label === b.action?.label &&
  a.items.length === b.items.length &&
  a.items.every((x, i) => x === b.items[i])

let prevSections = new Map<string, Section>()

export const sections = computed<Section[]>(() => {
  const next = buildSections()
  const out = next.map((s) => {
    const old = prevSections.get(s.key)
    return old && same(old, s) ? old : s
  })
  prevSections = new Map(out.map((s) => [s.key, s]))
  return out
})

function buildSections(): Section[] {
  const m = model.value
  const v = local.view
  const draggable = settings.sort === 'browser'
  const out: Section[] = []

  const folderSections = (rootId: string, showRoot: boolean) => {
    const inside = descendants(m, rootId)
    const insideSet = new Set(inside)
    for (const id of inside) {
      const f = m.folders.get(id)!
      const items = visibleIn(f)
      if (!items.length) continue
      const path = ancestors(m, id)
        .filter((a) => insideSet.has(a.id) && (showRoot || a.id !== rootId))
        .map((a) => a.title)
        .join(' / ')
      out.push({
        key: id,
        title: f.title,
        path,
        items: sortBookmarks(items, settings.sort, settings.dir, ctx),
        folderId: id,
        meta: 'ago',
        draggable,
      })
    }
  }

  if (v === CLEAN) {
    const extra = extraCopies.value.length
    out.push({
      key: 'dupes',
      title: 'Duplicates',
      path: '',
      items: dupeGroups.value.flat(),
      meta: 'folder',
      draggable: false,
      empty: 'No duplicate bookmarks.',
      action: extra ? { label: `Remove ${extra} extra ${extra === 1 ? 'copy' : 'copies'}`, kind: 'dupes' } : undefined,
    })
    const old = staleItems.value
    out.push({
      key: 'stale',
      title: 'Not opened in 6 months',
      path: '',
      items: old,
      meta: 'added',
      draggable: false,
      empty:
        Date.now() - since < 30 * 864e5
          ? 'Dovetab needs about a month of usage before it can tell which bookmarks you never open.'
          : 'Every old bookmark was opened recently.',
      action: old.length ? { label: 'Delete all', kind: 'stale' } : undefined,
    })
  } else if (v === RECO) {
    out.push({
      key: 'top',
      title: 'Frequently opened',
      path: '',
      items: recommended(12),
      meta: 'usage',
      draggable: false,
      empty: 'Bookmarks you open from here will show up in this list.',
    })
    const fresh = recentlyAdded(12)
    if (fresh.length)
      out.push({ key: 'new', title: 'Recently added', path: '', items: fresh, meta: 'added', draggable: false })
  } else if (v === ALL || !m.folders.has(v)) {
    const seen = recentOn() ? recent.value.filter((b) => !isHidden(b)) : []
    if (seen.length)
      out.push({ key: 'recent', title: 'Recently visited', path: '', items: seen, meta: 'visited', draggable: false })
    const top = recommended(8)
    if (top.length) out.push({ key: RECO, title: 'Recommended', path: '', items: top, meta: 'usage', draggable: false })
    m.roots.forEach((r) => folderSections(r, true))
  } else {
    folderSections(v, false)
  }
  return out
}

export const currentFolder = computed(() => model.value.folders.get(local.view))

export const crumbs = computed(() => (currentFolder.value ? ancestors(model.value, local.view) : []))

export const title = computed(() =>
  local.view === RECO
    ? 'Recommended'
    : local.view === CLEAN
      ? 'Cleanup'
      : (currentFolder.value?.title ?? 'All bookmarks'),
)

export const total = computed(() => {
  if (local.view === RECO) return ''
  if (local.view === CLEAN) return String(cleanupCount.value || '')
  return String(currentFolder.value ? (counts.value.get(local.view) ?? 0) : totalCount.value)
})

export interface TreeRow {
  id: string
  title: string
  depth: number
  icon: 'layers' | 'sparkles' | 'brush-cleaning' | 'bookmark' | 'folder'
  count: string
  hasKids: boolean
  open: boolean
  folder: boolean
}

export const isOpen = (f: Folder) => local.open[f.id] ?? f.depth === 0

export const treeRows = computed<TreeRow[]>(() => {
  const m = model.value
  const rows: TreeRow[] = [
    {
      id: ALL,
      title: 'All bookmarks',
      depth: 0,
      icon: 'layers',
      count: String(totalCount.value),
      hasKids: false,
      open: false,
      folder: false,
    },
    {
      id: RECO,
      title: 'Recommended',
      depth: 0,
      icon: 'sparkles',
      count: '',
      hasKids: false,
      open: false,
      folder: false,
    },
    {
      id: CLEAN,
      title: 'Cleanup',
      depth: 0,
      icon: 'brush-cleaning',
      count: String(cleanupCount.value || ''),
      hasKids: false,
      open: false,
      folder: false,
    },
  ]
  const base = rows.length
  const walk = (id: string) => {
    const f = m.folders.get(id)!
    const open = isOpen(f)
    rows.push({
      id,
      title: f.title,
      depth: f.depth,
      icon: f.depth === 0 && rows.length === base ? 'bookmark' : 'folder',
      count: String(counts.value.get(id) ?? 0),
      hasKids: f.folders.length > 0,
      open,
      folder: true,
    })
    if (open) f.folders.forEach(walk)
  }
  m.roots.filter((r) => (counts.value.get(r) ?? 0) > 0 || m.folders.get(r)!.folders.length > 0).forEach(walk)
  return rows
})

export function go(id: string) {
  const m = model.value
  for (const a of ancestors(m, id)) local.open[a.id] = true
  local.view = id
}
