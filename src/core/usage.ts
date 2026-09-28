import { shallowRef, watch } from 'vue'
import { model } from './bookmarks'
import { browser, hasPermission, later } from './platform'
import { settings } from './settings'
import type { Usage } from './score'
import { hostOf, type Bookmark } from './tree'

const KEY = 'dovetab:stats'
const SINCE_KEY = 'dovetab:since'
const VISITS_KEY = 'dovetab:visits'
const RECENT_KEY = 'dovetab:recent'
const RECENT_MAX = 12
type Stats = Record<string, [number, number]>
type Visits = Map<string, [number, number]>

function readStats(): Stats {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Stats
  } catch {
    return {}
  }
}

function readSince(): number {
  try {
    const v = Number(localStorage.getItem(SINCE_KEY))
    if (v) return v
    const now = Date.now()
    localStorage.setItem(SINCE_KEY, String(now))
    return now
  } catch {
    return Date.now()
  }
}

export const since = readSince()

export const stats = shallowRef<Stats>(readStats())
function readVisits(): Visits {
  try {
    return settings.history
      ? new Map(JSON.parse(localStorage.getItem(VISITS_KEY) ?? '[]') as [string, [number, number]][])
      : new Map()
  } catch {
    return new Map()
  }
}

export const visits = shallowRef<Visits>(readVisits())

function setVisits(m: Visits) {
  const cur = visits.value
  if (m.size === cur.size && [...m].every(([u, [n, t]]) => cur.get(u)?.[0] === n && cur.get(u)?.[1] === t)) return
  visits.value = m
  try {
    if (m.size) localStorage.setItem(VISITS_KEY, JSON.stringify([...m]))
    else localStorage.removeItem(VISITS_KEY)
  } catch {}
}

export function recordOpen(url: string) {
  const s = { ...stats.value }
  const [c = 0] = s[url] ?? []
  s[url] = [c + 1, Date.now()]
  stats.value = s
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearStats() {
  stats.value = {}
  localStorage.removeItem(KEY)
}

export function usageOf(url: string): Usage {
  const [clicks = 0, lastOpen = 0] = stats.value[url] ?? []
  const [v = 0, lastVisit = 0] = visits.value.get(url) ?? []
  return { clicks, visits: v, last: Math.max(lastOpen, lastVisit) }
}

export const historyGranted = shallowRef(false)
const HISTORY_DAYS = 5

async function loadHistory() {
  historyGranted.value = await hasPermission({ permissions: ['history'] })
  if (!settings.history || !historyGranted.value) return setVisits(new Map())
  const items = await browser.history.search({
    text: '',
    startTime: Date.now() - HISTORY_DAYS * 864e5,
    maxResults: 5000,
  })
  const urls = new Set([...model.value.bookmarks.values()].map((b) => b.url))
  const m: Visits = new Map()
  for (const h of items) if (h.url && urls.has(h.url)) m.set(h.url, [h.visitCount ?? 0, h.lastVisitTime ?? 0])
  setVisits(m)
}

export const recentOn = () => settings.history && settings.recent

const toBookmark = ([url, title, time]: [string, string, number], index: number): Bookmark => ({
  id: `h:${url}`,
  parentId: '',
  title: title || hostOf(url),
  url,
  host: hostOf(url),
  dateAdded: time,
  index,
})

function readRecent(): Bookmark[] {
  try {
    return recentOn()
      ? (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as [string, string, number][]).map(toBookmark)
      : []
  } catch {
    return []
  }
}

export const recent = shallowRef<Bookmark[]>(readRecent())
export const recentOf = (id: string) => recent.value.find((b) => b.id === id)

function setRecent(rows: [string, string, number][]) {
  const cur = recent.value
  if (
    rows.length === cur.length &&
    rows.every(([u, t, v], i) => cur[i]!.url === u && cur[i]!.dateAdded === v && cur[i]!.title === (t || hostOf(u)))
  )
    return
  recent.value = rows.map(toBookmark)
  try {
    if (rows.length) localStorage.setItem(RECENT_KEY, JSON.stringify(rows))
    else localStorage.removeItem(RECENT_KEY)
  } catch {}
}

export async function loadRecent() {
  if (!recentOn() || !(await hasPermission({ permissions: ['history'] }))) return setRecent([])
  const items = await browser.history.search({ text: '', startTime: Date.now() - 7 * 864e5, maxResults: 100 })
  const rows: [string, string, number][] = []
  const seen = new Set<string>()
  for (const h of items.sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))) {
    if (!h.url || !/^https?:/.test(h.url) || seen.has(h.url)) continue
    seen.add(h.url)
    rows.push([h.url, h.title ?? '', h.lastVisitTime ?? 0])
    if (rows.length === RECENT_MAX) break
  }
  setRecent(rows)
}

export function initUsage(): Promise<void> {
  later(() => void loadHistory())
  watch(
    () => settings.history,
    () => void loadHistory(),
  )
  watch(recentOn, () => void loadRecent())
  document.addEventListener('visibilitychange', () => document.hidden || void loadRecent())
  return loadRecent().catch(() => {})
}

export async function searchHistory(text: string, limit = 6) {
  if (!settings.history || !historyGranted.value) return []
  const items = await browser.history.search({ text, maxResults: limit * 3, startTime: 0 })
  return items.filter((h) => h.url && h.title).slice(0, limit)
}
