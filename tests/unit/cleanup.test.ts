import { describe, expect, it } from 'vitest'
import { duplicates, stale, uniqueVisits, urlKey } from '@/core/cleanup'
import type { Bookmark } from '@/core/tree'

const DAY = 864e5
const NOW = 1_800_000_000_000
const bm = (id: string, url: string, dateAdded = NOW): Bookmark => ({
  id,
  parentId: '1',
  title: id,
  url,
  host: '',
  dateAdded,
  index: 0,
})

describe('urlKey', () => {
  it('ignores www, case, trailing slash, hash and utm', () => {
    const k = urlKey('https://example.com/a')
    expect(urlKey('https://WWW.Example.com/a/')).toBe(k)
    expect(urlKey('http://example.com/a#top')).toBe(k)
    expect(urlKey('https://example.com/a?utm_source=x&utm_medium=y')).toBe(k)
  })
  it('keeps meaningful query and path', () => {
    expect(urlKey('https://example.com/a?id=1')).not.toBe(urlKey('https://example.com/a?id=2'))
    expect(urlKey('https://example.com/a')).not.toBe(urlKey('https://example.com/b'))
  })
  it('leaves non-web urls intact', () => {
    expect(urlKey('javascript:void(0)')).toBe('javascript:void(0)')
  })
})

describe('duplicates', () => {
  it('groups copies in browser order', () => {
    const g = duplicates([
      bm('a', 'https://x.com/'),
      bm('b', 'https://y.com'),
      bm('c', 'https://www.x.com'),
      bm('d', 'https://y.com/?utm_campaign=z'),
      bm('e', 'https://z.com'),
    ])
    expect(g.map((x) => x.map((b) => b.id))).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ])
  })
})

describe('stale', () => {
  const none = () => ({ clicks: 0, visits: 0, last: 0 })
  const old = bm('old', 'https://o.com', NOW - 400 * DAY)
  const fresh = bm('fresh', 'https://f.com', NOW - 10 * DAY)

  it('needs a month of tracking', () => {
    expect(stale([old], none, NOW, NOW - 5 * DAY)).toEqual([])
  })
  it('lists old bookmarks never opened', () => {
    expect(stale([old, fresh], none, NOW, NOW - 60 * DAY).map((b) => b.id)).toEqual(['old'])
  })
  it('skips opened ones', () => {
    const used = () => ({ clicks: 1, visits: 0, last: NOW - DAY })
    expect(stale([old], used, NOW, NOW - 60 * DAY)).toEqual([])
  })
})

describe('uniqueVisits', () => {
  it('keeps the newest visit of each page and skips non-web urls', () => {
    const rows = uniqueVisits(
      [
        { url: 'https://example.com/a', title: 'A', lastVisitTime: 5 },
        { url: 'https://www.example.com/a/#top', title: 'A', lastVisitTime: 9 },
        { url: 'http://example.com/a?utm_source=x', title: 'A', lastVisitTime: 7 },
        { url: 'https://app.test/inbox?id=1', title: 'Inbox', lastVisitTime: 8 },
        { url: 'https://app.test/inbox?id=2', title: 'Inbox', lastVisitTime: 6 },
        { url: 'https://other.test/inbox', title: 'Inbox', lastVisitTime: 4 },
        { url: 'https://app.test/a', title: '', lastVisitTime: 3 },
        { url: 'https://app.test/b', title: '', lastVisitTime: 2 },
        { url: 'chrome://settings/', title: 'Settings', lastVisitTime: 10 },
      ],
      10,
    )
    expect(rows.map((r) => r[0])).toEqual([
      'https://www.example.com/a/#top',
      'https://app.test/inbox?id=1',
      'https://other.test/inbox',
      'https://app.test/a',
      'https://app.test/b',
    ])
  })

  it('stops at the limit', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ url: `https://s${i}.test/`, lastVisitTime: i }))
    expect(uniqueVisits(items, 12)).toHaveLength(12)
  })
})
