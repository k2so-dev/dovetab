import type { RawNode } from '../tree'
import { ctx } from './ctx'
import { keysFrom, lockFile, newSyncKey, parseSyncKey, seal, unlockFile, unseal } from './crypto'
import {
  LOCAL_ONLY,
  localRoots,
  pack,
  plan,
  readRoots,
  summary,
  targets,
  unpack,
  type Item,
  type Op,
  type Snapshot,
} from './format'
import { exportColors, exportIcons, importIcons } from './icons'
import { pull, push } from './nostr'

export { newSyncKey, parseSyncKey }
export { init } from './ctx'

export interface Incoming {
  from: string
  ts: number
  add: number
  remove: number
  move: number
  settings: number
  icons: number
  apply: () => Promise<void>
}

function browserName(): string {
  if (ctx.isFirefox) return /Zen\//.test(navigator.userAgent) ? 'Zen' : 'Firefox'
  if ((navigator as { brave?: unknown }).brave) return 'Brave'
  const ua = navigator.userAgent
  if (/AppleWebKit\/(?!537\.36)/.test(ua)) return 'Orion'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\//.test(ua)) return 'Opera'
  if (/Vivaldi/.test(ua)) return 'Vivaldi'
  return 'Chrome'
}

const getTree = async () => (await ctx.browser.bookmarks.getTree()) as RawNode[]

const syncable = (k: string) => !LOCAL_ONLY.includes(k) && k in ctx.settings

async function build(withIcons: boolean): Promise<Uint8Array> {
  const s = JSON.parse(JSON.stringify(ctx.settings)) as Record<string, unknown>
  for (const k of LOCAL_ONLY) delete s[k]
  const icons = withIcons ? await exportIcons().catch(() => null) : null
  const snap: Snapshot = {
    v: 1,
    ts: Date.now(),
    from: browserName(),
    settings: s,
    roots: readRoots(await getTree()),
    colors: exportColors(),
    icons: icons?.hosts,
  }
  return pack(snap, icons?.data)
}

function diff(tree: RawNode[], snap: Snapshot): Op[] {
  const ops: Op[] = []
  for (const [n, items] of targets(snap.roots, localRoots(tree))) plan(n, items, ops)
  return ops
}

async function run(ops: Op[]) {
  const b = ctx.browser.bookmarks
  await Promise.all(
    ops.flatMap((o) => (o.t === 'remove' ? [(o.tree ? b.removeTree(o.id) : b.remove(o.id)).catch(() => {})] : [])),
  )
  const create = async (parentId: string, item: Item, index?: number) => {
    const url = typeof item[1] === 'string' ? item[1] : undefined
    const c = await b.create({ parentId, index, title: item[0], url })
    if (typeof item[1] !== 'string') for (const x of item[1]) await create(c.id, x)
  }
  const groups = new Map<string, Op[]>()
  for (const o of ops) if (o.t !== 'remove') groups.set(o.parentId, [...(groups.get(o.parentId) ?? []), o])
  const queue = [...groups.values()]
  const worker = async () => {
    for (let g = queue.shift(); g; g = queue.shift())
      for (const o of g) {
        try {
          if (o.t === 'create') await create(o.parentId, o.item, o.index)
          else if (o.t === 'move') await b.move(o.id, { parentId: o.parentId, index: o.index })
        } catch {}
      }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
}

function changedSettings(s: Record<string, unknown>): string[] {
  const cur = ctx.settings as unknown as Record<string, unknown>
  return Object.keys(s).filter((k) => syncable(k) && JSON.stringify(s[k]) !== JSON.stringify(cur[k]))
}

async function apply(snap: Snapshot, icons: Uint8Array | undefined, undo: boolean) {
  const backup = undo ? await build(false) : null
  await ctx.batch(async () => run(diff(await getTree(), snap)))
  const cur = ctx.settings as unknown as Record<string, unknown>
  for (const k of changedSettings(snap.settings)) cur[k] = snap.settings[k]
  await importIcons(snap.icons ?? [], icons, snap.colors).catch(() => 0)
  if (backup)
    ctx.toast(`Synced from ${snap.from}`, async () => {
      await apply(unpack(backup).snap, undefined, false)
    })
}

async function prepare(data: Uint8Array): Promise<Incoming> {
  const { snap, icons } = unpack(data)
  const s = summary(diff(await getTree(), snap))
  return {
    from: snap.from,
    ts: snap.ts,
    ...s,
    settings: changedSettings(snap.settings).length,
    icons: snap.icons?.length ?? 0,
    apply: () => apply(snap, icons, true),
  }
}

async function keys(key: string) {
  const secret = parseSyncKey(key)
  if (!secret) throw new Error('Invalid sync key')
  return keysFrom(secret)
}

export async function upload(key: string, withIcons: boolean): Promise<number> {
  const k = await keys(key)
  const ok = await push(k.nostr, await seal(k.aes, await build(withIcons)), Date.now())
  if (!ok) throw new Error('No relay accepted the upload')
  return ok
}

export async function download(key: string): Promise<Incoming | null> {
  const k = await keys(key)
  const data = await pull(k.nostr)
  return data && prepare(await unseal(k.aes, data))
}

export async function exportFile(password: string, withIcons: boolean) {
  const data = await lockFile(password, await build(withIcons))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' }))
  a.download = `dovetab-${new Date().toISOString().slice(0, 10)}.dovetab`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function importFile(file: File, password: string): Promise<Incoming> {
  return prepare(await unlockFile(password, new Uint8Array(await file.arrayBuffer())))
}
