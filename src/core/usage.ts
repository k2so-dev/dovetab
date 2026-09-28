import { shallowRef, watch } from 'vue'
import { browser, hasPermission } from './platform'
import { settings } from './settings'
import type { Usage } from './score'

const KEY = 'shelf:stats'
const SINCE_KEY = 'shelf:since'
type Stats = Record<string, [number, number]>

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
export const visits = shallowRef<Map<string, [number, number]>>(new Map())

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
  if (!settings.history || !historyGranted.value) {
    visits.value = new Map()
    return
  }
  const items = await browser.history.search({
    text: '',
    startTime: Date.now() - HISTORY_DAYS * 864e5,
    maxResults: 5000,
  })
  const m = new Map<string, [number, number]>()
  for (const h of items) if (h.url) m.set(h.url, [h.visitCount ?? 0, h.lastVisitTime ?? 0])
  visits.value = m
}

export function initUsage() {
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn) : setTimeout(fn, 100))
  idle(() => void loadHistory())
  watch(
    () => settings.history,
    () => void loadHistory(),
  )
}

export async function searchHistory(text: string, limit = 6) {
  if (!settings.history || !historyGranted.value) return []
  const items = await browser.history.search({ text, maxResults: limit * 3, startTime: 0 })
  return items.filter((h) => h.url && h.title).slice(0, limit)
}
