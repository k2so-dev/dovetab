import { describe, expect, it } from 'vitest'
import { NEUTRAL, dominantColor, hashColor } from '@/core/color'
import { ago, recencyBoost, score } from '@/core/score'
import { matchScore } from '@/core/search'
import { sortBookmarks, type SortCtx } from '@/core/sort'
import { ancestors, buildModel, descendants, flatFolders, hostOf, type RawNode } from '@/core/tree'

const DAY = 864e5
const NOW = Date.UTC(2026, 8, 28)

const raw: RawNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks bar',
        children: [
          { id: '10', title: 'GitHub', url: 'https://github.com/', index: 0, dateAdded: NOW - 30 * DAY },
          {
            id: '11',
            title: 'Work',
            index: 1,
            children: [
              { id: '110', title: 'Linear', url: 'https://linear.app/', index: 0, dateAdded: NOW - DAY },
              { id: '111', title: 'Dev', index: 1, children: [] },
            ],
          },
          { id: '12', title: '', url: 'https://www.example.org/x', index: 2, dateAdded: NOW },
          { id: '13', title: '', url: 'data:', type: 'separator', index: 3 },
        ],
      },
      { id: '2', title: 'Other bookmarks', children: [] },
    ],
  },
]

describe('tree', () => {
  const m = buildModel(raw)

  it('normalizes folders and bookmarks, skipping separators', () => {
    expect(m.roots).toEqual(['1', '2'])
    expect(m.folders.get('1')!.bookmarks).toEqual(['10', '12'])
    expect(m.folders.get('1')!.folders).toEqual(['11'])
    expect(m.folders.get('111')!.depth).toBe(2)
    expect(m.folders.get('1')!.locked).toBe(true)
    expect(m.folders.get('11')!.locked).toBe(false)
  })

  it('falls back to host for untitled bookmarks', () => {
    expect(m.bookmarks.get('12')!.title).toBe('example.org')
    expect(hostOf('https://www.example.org/x')).toBe('example.org')
  })

  it('walks descendants and ancestors', () => {
    expect(descendants(m, '1')).toEqual(['1', '11', '111'])
    expect(ancestors(m, '111').map((f) => f.id)).toEqual(['1', '11'])
    expect(flatFolders(m).map((f) => f.id)).toEqual(['1', '11', '111', '2'])
  })
})

describe('score', () => {
  it('ranks used bookmarks above unused ones', () => {
    const used = score({ clicks: 5, visits: 0, last: NOW - DAY / 2 }, NOW - 100 * DAY, NOW)
    const unused = score({ clicks: 0, visits: 0, last: 0 }, NOW - 100 * DAY, NOW)
    expect(used).toBeGreaterThan(unused)
    expect(unused).toBe(0)
  })

  it('prefers recent use at equal frequency', () => {
    const recent = score({ clicks: 3, visits: 0, last: NOW - DAY / 2 }, 0, NOW)
    const old = score({ clicks: 3, visits: 0, last: NOW - 40 * DAY }, 0, NOW)
    expect(recent).toBeGreaterThan(old)
    expect(recencyBoost(0, NOW)).toBe(0)
  })

  it('gives freshly added bookmarks a fading bonus', () => {
    const none = { clicks: 0, visits: 0, last: 0 }
    expect(score(none, NOW, NOW)).toBeGreaterThan(score(none, NOW - 3 * DAY, NOW))
    expect(score(none, NOW - 8 * DAY, NOW)).toBe(0)
  })

  it('formats relative time', () => {
    expect(ago(0, NOW)).toBe('')
    expect(ago(NOW - 10 * 60e3, NOW)).toBe('now')
    expect(ago(NOW - 3 * 36e5, NOW)).toBe('3h ago')
    expect(ago(NOW - 2 * DAY, NOW)).toBe('2d ago')
  })
})

describe('sort', () => {
  const m = buildModel(raw)
  const list = [...m.bookmarks.values()]
  const clicks: Record<string, number> = { 'https://linear.app/': 9 }
  const ctx: SortCtx = {
    usage: (b) => ({ clicks: clicks[b.url] ?? 0, visits: 0, last: clicks[b.url] ? NOW : 0 }),
    score: (b) => clicks[b.url] ?? 0,
    pinned: (b) => b.id === '12',
  }
  const ids = (key: Parameters<typeof sortBookmarks>[1], dir: 'asc' | 'desc' = 'asc') =>
    sortBookmarks(list, key, dir, ctx).map((b) => b.title)

  it('keeps pinned first in every mode', () => {
    expect(ids('name')[0]).toBe('example.org')
    expect(ids('name', 'desc')[0]).toBe('example.org')
  })

  it('sorts by name, usage and date', () => {
    expect(ids('name')).toEqual(['example.org', 'GitHub', 'Linear'])
    expect(ids('opened')).toEqual(['example.org', 'Linear', 'GitHub'])
    expect(ids('added')).toEqual(['example.org', 'Linear', 'GitHub'])
    expect(ids('added', 'desc')).toEqual(['example.org', 'GitHub', 'Linear'])
  })
})

describe('search', () => {
  it('requires every token to match', () => {
    expect(matchScore('git hub', 'GitHub', 'https://github.com')).toBeGreaterThan(0)
    expect(matchScore('git lab', 'GitHub', 'https://github.com')).toBe(0)
  })

  it('ranks prefix and word-start matches higher', () => {
    const prefix = matchScore('doc', 'Docs home', 'https://a.com')
    const word = matchScore('doc', 'Vue docs', 'https://a.com')
    const inner = matchScore('doc', 'Markdoc', 'https://a.com')
    expect(prefix).toBeGreaterThan(word)
    expect(word).toBeGreaterThan(inner)
  })

  it('matches the URL without scheme and www', () => {
    expect(matchScore('example', 'Home', 'https://www.example.com')).toBeGreaterThan(0)
    expect(matchScore('https', 'Home', 'https://www.example.com')).toBe(0)
  })
})

describe('color', () => {
  const px = (rgba: number[], n: number) => Array.from({ length: n }, () => rgba).flat()

  it('picks the saturated color', () => {
    const data = [...px([255, 255, 255, 255], 100), ...px([230, 30, 40, 255], 60)]
    expect(dominantColor(data)).toBe('#e61e28')
  })

  it('returns neutral for monochrome and transparent icons', () => {
    expect(dominantColor(px([20, 20, 20, 255], 100))).toBe(NEUTRAL)
    expect(dominantColor(px([230, 30, 40, 0], 100))).toBe(NEUTRAL)
  })

  it('hashes hosts to stable colors', () => {
    expect(hashColor('github.com')).toBe(hashColor('github.com'))
    expect(hashColor('github.com')).not.toBe(hashColor('gitlab.com'))
  })
})
