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
