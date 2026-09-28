export interface Usage {
  clicks: number
  visits: number
  last: number
}

const DAY = 864e5

export const W = {
  click: 1.2,
  visit: 0.4,
  freq: 2,
  recent: [
    [1, 2.4],
    [7, 2],
    [14, 1.6],
    [30, 1.2],
  ] as const,
  stale: 0.4,
  freshDays: 7,
  fresh: 1,
}

export function recencyBoost(last: number, now: number): number {
  if (!last) return 0
  const days = (now - last) / DAY
  for (const [limit, boost] of W.recent) if (days < limit) return boost
  return W.stale * Math.exp(-(days - 30) / 60)
}

export function score(u: Usage, dateAdded: number, now: number): number {
  const weighted = u.clicks * W.click + u.visits * W.visit
  const freq = Math.log2(1 + weighted) * W.freq
  const age = (now - dateAdded) / DAY
  const fresh = dateAdded && age < W.freshDays ? W.fresh * (1 - age / W.freshDays) : 0
  return freq + (weighted > 0 ? recencyBoost(u.last, now) : 0) + fresh
}

export function ago(ts: number, now = Date.now()): string {
  if (!ts) return ''
  const h = (now - ts) / 36e5
  if (h < 1) return 'now'
  if (h < 24) return `${Math.floor(h)}h ago`
  const d = Math.floor(h / 24)
  if (d < 60) return `${d}d ago`
  const mo = Math.floor(d / 30)
  return mo < 24 ? `${mo}mo ago` : `${Math.floor(d / 365)}y ago`
}
