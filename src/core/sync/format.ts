import type { RawNode } from '../tree'

export type Item = [string, string] | [string, Item[]]
export type Kind = 'bar' | 'other' | 'mobile' | 'menu'
export interface RootSnap {
  kind: Kind
  items: Item[]
}
export interface Snapshot {
  v: 1
  ts: number
  from: string
  settings: Record<string, unknown>
  roots: RootSnap[]
  colors: Record<string, string>
  icons?: string[]
}

export type Op =
  | { t: 'remove'; id: string; tree: boolean }
  | { t: 'create'; parentId: string; index: number; item: Item }
  | { t: 'move'; id: string; parentId: string; index: number }

export const MENU_TITLE = 'Bookmarks Menu'
export const LOCAL_ONLY = ['history', 'siteIcons', 'recent']

type Node = RawNode & { folderType?: string; unmodifiable?: string }

const FIREFOX: Record<string, Kind> = {
  toolbar_____: 'bar',
  unfiled_____: 'other',
  mobile______: 'mobile',
  menu________: 'menu',
}
const FOLDER_TYPE: Record<string, Kind> = { 'bookmarks-bar': 'bar', other: 'other', mobile: 'mobile' }
const ORDER: Kind[] = ['bar', 'other', 'mobile']

export function rootKind(n: Node, i: number): Kind | null {
  if (n.unmodifiable || n.folderType === 'managed') return null
  return FIREFOX[n.id] ?? (n.folderType ? FOLDER_TYPE[n.folderType] : undefined) ?? ORDER[i] ?? null
}

const fixed = (n: RawNode) => n.type === 'separator' || !!n.url?.startsWith('place:')
const isFolder = (n: RawNode) => !n.url && n.type !== 'separator'

export function toItems(n: RawNode): Item[] {
  const out: Item[] = []
  for (const c of n.children ?? []) {
    if (fixed(c)) continue
    out.push(isFolder(c) ? [c.title, toItems(c)] : [c.title, c.url!])
  }
  return out
}

export function localRoots(tree: RawNode[]): Map<Kind, Node> {
  const m = new Map<Kind, Node>()
  ;(tree[0]?.children ?? []).forEach((n, i) => {
    const k = rootKind(n, i)
    if (k && !m.has(k)) m.set(k, n)
  })
  return m
}

export function readRoots(tree: RawNode[]): RootSnap[] {
  return [...localRoots(tree)].map(([kind, n]) => ({ kind, items: toItems(n) }))
}

export function targets(snap: RootSnap[], local: Map<Kind, Node>): Map<Node, Item[]> {
  const out = new Map<Node, Item[]>()
  const add = (n: Node, items: Item[]) => out.set(n, [...(out.get(n) ?? []), ...items])
  const kinds = new Set(snap.map((r) => r.kind))
  for (const r of snap) {
    let items = r.items
    if (r.kind === 'other' && local.has('menu') && !kinds.has('menu')) {
      const i = items.findIndex((x) => x[0] === MENU_TITLE && Array.isArray(x[1]))
      if (i >= 0) {
        add(local.get('menu')!, items[i]![1] as Item[])
        items = items.filter((_, j) => j !== i)
      }
    }
    const n = local.get(r.kind)
    if (n) add(n, items)
    else if (local.has('other')) add(local.get('other')!, [[r.kind === 'menu' ? MENU_TITLE : r.kind, items]])
  }
  return out
}

const keyOf = (title: string, url: string | null) => (url === null ? `f:${title}` : `b:${title}\n${url}`)
const itemKey = (x: Item) => keyOf(x[0], typeof x[1] === 'string' ? x[1] : null)
const nodeKey = (n: RawNode) => keyOf(n.title, isFolder(n) ? null : n.url!)

export function plan(n: RawNode, items: Item[], ops: Op[] = []): Op[] {
  const kids = n.children ?? []
  const pool = new Map<string, RawNode[]>()
  for (const c of kids) {
    if (fixed(c)) continue
    const k = nodeKey(c)
    pool.set(k, [...(pool.get(k) ?? []), c])
  }
  const match = items.map((x) => pool.get(itemKey(x))?.shift())
  const used = new Set(match.filter(Boolean))
  for (const c of kids) if (!fixed(c) && !used.has(c)) ops.push({ t: 'remove', id: c.id, tree: isFolder(c) })
  const cur: (RawNode | null)[] = kids.filter((c) => fixed(c) || used.has(c))
  let p = 0
  items.forEach((x, i) => {
    while (cur[p] && fixed(cur[p]!)) p++
    const m = match[i]
    if (m) {
      if (cur[p] !== m) {
        cur.splice(cur.indexOf(m), 1)
        cur.splice(p, 0, m)
        ops.push({ t: 'move', id: m.id, parentId: n.id, index: p })
      }
      if (typeof x[1] !== 'string') plan(m, x[1], ops)
    } else {
      cur.splice(p, 0, null)
      ops.push({ t: 'create', parentId: n.id, index: p, item: x })
    }
    p++
  })
  return ops
}

export function count(items: Item[]): number {
  return items.reduce((s, x) => s + (typeof x[1] === 'string' ? 1 : 1 + count(x[1])), 0)
}

export function summary(ops: Op[]) {
  let add = 0
  let remove = 0
  let move = 0
  for (const o of ops) {
    if (o.t === 'create') add += typeof o.item[1] === 'string' ? 1 : 1 + count(o.item[1])
    else if (o.t === 'remove') remove++
    else move++
  }
  return { add, remove, move }
}

export function pack(snap: Snapshot, icons?: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(snap))
  const out = new Uint8Array(4 + json.length + (icons?.length ?? 0))
  new DataView(out.buffer).setUint32(0, json.length)
  out.set(json, 4)
  if (icons) out.set(icons, 4 + json.length)
  return out
}

export function unpack(data: Uint8Array): { snap: Snapshot; icons?: Uint8Array } {
  const len = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0)
  const snap = JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + len))) as Snapshot
  if (snap.v !== 1 || !Array.isArray(snap.roots)) throw new Error('Unsupported sync data')
  const rest = data.subarray(4 + len)
  return { snap, icons: rest.length ? rest : undefined }
}
