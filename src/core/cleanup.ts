import type { Usage } from './score'
import type { Bookmark } from './tree'

const DAY = 864e5
export const STALE_DAYS = 180
export const TRACK_DAYS = 30

export function urlKey(url: string): string {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return url
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('utm_')) u.searchParams.delete(k)
    const q = u.searchParams.toString()
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.host.toLowerCase().replace(/^www\./, '')}${path}${q ? '?' + q : ''}`
  } catch {
    return url
  }
}

export interface Visit {
  url?: string
  title?: string
  lastVisitTime?: number
}

export function uniqueVisits(items: Visit[], max: number): [string, string, number][] {
  const out: [string, string, number][] = []
  const seen = new Set<string>()
  for (const h of [...items].sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))) {
    if (!h.url || !/^https?:/.test(h.url)) continue
    const key = urlKey(h.url)
    const title = h.title?.trim() ?? ''
    const named = title && `${key.split(/[/?]/)[0]}|${title.toLowerCase()}`
    if (seen.has(key) || (named && seen.has(named))) continue
    seen.add(key)
    if (named) seen.add(named)
    out.push([h.url, title, h.lastVisitTime ?? 0])
    if (out.length === max) break
  }
  return out
}

export function duplicates(bookmarks: Iterable<Bookmark>): Bookmark[][] {
  const groups = new Map<string, Bookmark[]>()
  for (const b of bookmarks) {
    const k = urlKey(b.url)
    const g = groups.get(k)
    if (g) g.push(b)
    else groups.set(k, [b])
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

export function stale(
  bookmarks: Iterable<Bookmark>,
  usage: (b: Bookmark) => Usage,
  now: number,
  since: number,
): Bookmark[] {
  if (!since || now - since < TRACK_DAYS * DAY) return []
  const out: Bookmark[] = []
  for (const b of bookmarks) {
    if (!b.dateAdded || now - b.dateAdded < STALE_DAYS * DAY) continue
    const u = usage(b)
    if (u.clicks + u.visits === 0 && (!u.last || now - u.last > STALE_DAYS * DAY)) out.push(b)
  }
  return out.sort((a, b) => a.dateAdded - b.dateAdded)
}
