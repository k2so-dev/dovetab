import { describe, expect, it } from 'vitest'
import { duplicates, stale, urlKey } from '@/core/cleanup'
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
