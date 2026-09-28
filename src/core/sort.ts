import type { Bookmark } from './tree'
import type { Usage } from './score'

export type SortKey = 'browser' | 'name' | 'added' | 'visited' | 'opened' | 'frecency' | 'domain'

export const SORTS: [SortKey, string][] = [
  ['browser', 'Browser order'],
  ['frecency', 'Recommended'],
  ['opened', 'Most opened'],
  ['visited', 'Last opened'],
  ['name', 'Name'],
  ['added', 'Date added'],
  ['domain', 'Domain'],
]

export interface SortCtx {
  usage: (b: Bookmark) => Usage
  score: (b: Bookmark) => number
  pinned: (b: Bookmark) => boolean
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

export function sortBookmarks(list: Bookmark[], key: SortKey, dir: 'asc' | 'desc', ctx: SortCtx): Bookmark[] {
  const cmp: (a: Bookmark, b: Bookmark) => number = {
    browser: (a: Bookmark, b: Bookmark) => a.index - b.index,
    name: (a: Bookmark, b: Bookmark) => collator.compare(a.title, b.title),
    added: (a: Bookmark, b: Bookmark) => b.dateAdded - a.dateAdded,
    visited: (a: Bookmark, b: Bookmark) => ctx.usage(b).last - ctx.usage(a).last,
    opened: (a: Bookmark, b: Bookmark) => {
      const ua = ctx.usage(a)
      const ub = ctx.usage(b)
      return ub.clicks + ub.visits - (ua.clicks + ua.visits)
    },
    frecency: (a: Bookmark, b: Bookmark) => ctx.score(b) - ctx.score(a),
    domain: (a: Bookmark, b: Bookmark) => collator.compare(a.host, b.host) || collator.compare(a.title, b.title),
  }[key]
  const m = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => Number(ctx.pinned(b)) - Number(ctx.pinned(a)) || m * cmp(a, b) || a.index - b.index)
}
