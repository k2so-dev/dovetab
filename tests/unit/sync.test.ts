import { describe, expect, it } from 'vitest'
import { keysFrom, lockFile, newSyncKey, parseSyncKey, seal, unlockFile, unseal } from '@/core/sync/crypto'
import {
  MENU_TITLE,
  MOBILE_TITLE,
  localRoots,
  pack,
  plan,
  readRoots,
  summary,
  targets,
  unpack,
  type Item,
  type Snapshot,
} from '@/core/sync/format'
import type { RawNode } from '@/core/tree'

let seq = 0
function node(title: string, x: string | RawNode[], index = 0): RawNode {
  const id = String(++seq)
  return typeof x === 'string'
    ? { id, title, url: x, index }
    : { id, title, index, children: x.map((c, i) => ({ ...c, index: i, parentId: id })) }
}
const folder = (items: Item[], title = 'root'): RawNode =>
  node(
    title,
    items.map((x) => (typeof x[1] === 'string' ? node(x[0], x[1]) : folder(x[1], x[0]))),
  )

const a: Item = ['A', 'https://a.test/']
const b: Item = ['B', 'https://b.test/']
const c: Item = ['C', 'https://c.test/']

describe('sync plan', () => {
  it('does nothing for an identical tree', () => {
    const items: Item[] = [a, ['Dir', [b, c]]]
    expect(plan(folder(items), items)).toEqual([])
  })

  it('creates only what is missing', () => {
    const ops = plan(folder([a, c]), [a, b, c])
    expect(ops).toEqual([expect.objectContaining({ t: 'create', index: 1, item: b })])
  })

  it('removes extras', () => {
    const f = folder([a, b, c])
    expect(plan(f, [a, c])).toEqual([{ t: 'remove', id: f.children![1]!.id, tree: false }])
  })

  it('reorders with moves only', () => {
    const ops = plan(folder([a, b, c]), [c, a, b])
    expect(ops.every((o) => o.t === 'move')).toBe(true)
    expect(ops).toHaveLength(1)
  })

  it('recurses into matched folders and recreates renamed ones', () => {
    const f = folder([
      ['Dir', [a]],
      ['Old', [b]],
    ])
    const ops = plan(f, [
      ['Dir', [a, c]],
      ['New', [b]],
    ])
    expect(summary(ops)).toEqual({ add: 3, remove: 1, move: 0 })
  })

  it('keeps separators in place', () => {
    const f = folder([a, c])
    f.children!.splice(1, 0, { id: 'sep', title: '', type: 'separator', url: 'data:', index: 1 })
    expect(plan(f, [a, c])).toEqual([])
  })
})

describe('sync roots', () => {
  const firefox: RawNode[] = [
    {
      id: 'root________',
      title: '',
      children: [
        { id: 'menu________', title: 'Menu', children: [node('M', 'https://m.test/')] },
        { id: 'toolbar_____', title: 'Toolbar', children: [node('T', 'https://t.test/')] },
        { id: 'unfiled_____', title: 'Other', children: [] },
        { id: 'mobile______', title: 'Mobile', children: [] },
      ],
    },
  ]
  const chrome: RawNode[] = [
    {
      id: '0',
      title: '',
      children: [
        { id: '1', title: 'Bookmarks bar', children: [] },
        { id: '2', title: 'Other bookmarks', children: [] },
        { id: '3', title: 'Mobile bookmarks', children: [] },
      ],
    },
  ]

  it('maps Firefox menu into a folder in Chrome Other and back', () => {
    const snap = readRoots(firefox)
    const t = targets(snap, localRoots(chrome))
    const other = [...t].find(([n]) => n.id === '2')![1]
    expect(other).toEqual([[MENU_TITLE, [['M', 'https://m.test/']]]])
    const back = targets([{ kind: 'other', items: other }], localRoots(firefox))
    expect([...back].find(([n]) => n.id === 'menu________')![1]).toEqual([['M', 'https://m.test/']])
  })

  it('uses Orion roots although all of them are unmodifiable', () => {
    const root = (id: string, title: string, children: RawNode[] = []) =>
      ({ id, title, children, unmodifiable: 'managed' }) as RawNode
    const orion: RawNode[] = [
      root('0', '', [
        root('3', 'Favorites', [node('F', 'https://f.test/')]),
        root('2', 'Bookmarks'),
        root('1', 'Bookmarks Bar', [node('X', 'https://x.test/')]),
      ]),
    ]
    expect(readRoots(orion)).toEqual([
      { kind: 'bar', items: [['F', 'https://f.test/']] },
      { kind: 'other', items: [] },
    ])
    const snap = readRoots(chrome)
    snap[2]!.items = [['P', 'https://p.test/']]
    const t = targets(snap, localRoots(orion))
    expect([...t].map(([n]) => n.id)).toEqual(['3', '2'])
    expect(t.get([...t.keys()][1]!)).toEqual([[MOBILE_TITLE, [['P', 'https://p.test/']]]])
    const back = targets([{ kind: 'other', items: [[MOBILE_TITLE, [['P', 'https://p.test/']]]] }], localRoots(chrome))
    expect([...back].find(([n]) => n.id === '3')![1]).toEqual([['P', 'https://p.test/']])
  })

  it('skips a managed root next to regular ones', () => {
    const tree: RawNode[] = [
      {
        id: '0',
        title: '',
        children: [
          ...chrome[0]!.children!,
          { id: '9', title: 'Managed', children: [], unmodifiable: 'managed' } as RawNode,
        ],
      },
    ]
    expect(readRoots(tree).map((r) => r.kind)).toEqual(['bar', 'other', 'mobile'])
  })
})

describe('sync crypto', () => {
  const snap: Snapshot = { v: 1, ts: 1, from: 'Chrome', settings: {}, roots: [], colors: {} }

  it('packs json and icons', () => {
    const out = unpack(pack(snap, new Uint8Array([1, 2, 3])))
    expect(out.snap).toEqual(snap)
    expect([...out.icons!]).toEqual([1, 2, 3])
  })

  it('round-trips with a sync key', async () => {
    const key = newSyncKey()
    const k = await keysFrom(parseSyncKey(`paste: ${key} `)!)
    const data = new TextEncoder().encode('hello'.repeat(100))
    expect(await unseal(k.aes, await seal(k.aes, data))).toEqual(data)
    const other = await keysFrom(parseSyncKey(newSyncKey())!)
    await expect(unseal(other.aes, await seal(k.aes, data))).rejects.toThrow('Wrong key')
  })

  it('round-trips a password file', async () => {
    const data = pack(snap)
    const file = await lockFile('secret', data)
    expect(await unlockFile('secret', file)).toEqual(data)
    await expect(unlockFile('nope', file)).rejects.toThrow('Wrong key')
  })
})
