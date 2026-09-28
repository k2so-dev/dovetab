import { shallowRef } from 'vue'
import { browser, isFirefox } from './platform'
import { buildModel, type Model, type RawNode } from './tree'

const SNAP_KEY = 'shelf:snapshot'

function readSnapshot(): RawNode[] {
  try {
    return JSON.parse(localStorage.getItem(SNAP_KEY) ?? '[]') as RawNode[]
  } catch {
    return []
  }
}

function strip(n: RawNode): RawNode {
  const o: RawNode = { id: n.id, title: n.title, index: n.index, dateAdded: n.dateAdded }
  if (n.url) o.url = n.url
  if (n.type) o.type = n.type
  if (n.children) o.children = n.children.map(strip)
  return o
}

export const model = shallowRef<Model>(buildModel(readSnapshot()))
export const loaded = shallowRef(false)

export async function refresh() {
  const tree = (await browser.bookmarks.getTree()) as RawNode[]
  model.value = buildModel(tree)
  loaded.value = true
  const save = () => {
    try {
      localStorage.setItem(SNAP_KEY, JSON.stringify(tree.map(strip)))
    } catch {}
  }
  'requestIdleCallback' in window ? requestIdleCallback(save) : setTimeout(save, 200)
}

let timer: ReturnType<typeof setTimeout> | undefined
let importing = false
const schedule = () => {
  if (importing) return
  clearTimeout(timer)
  timer = setTimeout(refresh, 30)
}

export function watchBookmarks() {
  const b = browser.bookmarks
  b.onCreated.addListener(schedule)
  b.onRemoved.addListener(schedule)
  b.onChanged.addListener(schedule)
  b.onMoved.addListener(schedule)
  b.onChildrenReordered?.addListener(schedule)
  b.onImportBegan?.addListener(() => (importing = true))
  b.onImportEnded?.addListener(() => {
    importing = false
    schedule()
  })
}

export const updateBookmark = (id: string, changes: { title?: string; url?: string }) =>
  browser.bookmarks.update(id, changes)

export const createBookmark = (parentId: string, title: string, url?: string, index?: number) =>
  browser.bookmarks.create({ parentId, title, url, index })

export async function moveBookmark(id: string, parentId: string, beforeIndex?: number) {
  if (beforeIndex === undefined) return browser.bookmarks.move(id, { parentId })
  const [node] = await browser.bookmarks.get(id)
  let index = beforeIndex
  if (isFirefox && node?.parentId === parentId && (node.index ?? 0) < beforeIndex) index--
  return browser.bookmarks.move(id, { parentId, index })
}

export async function removeNode(id: string): Promise<() => Promise<Map<string, string>>> {
  const [sub] = (await browser.bookmarks.getSubTree(id)) as RawNode[]
  if (!sub) return async () => new Map()
  if (sub.url) await browser.bookmarks.remove(id)
  else await browser.bookmarks.removeTree(id)
  const parentId = sub.parentId!
  return async () => {
    const ids = new Map<string, string>()
    const restore = async (n: RawNode, parent: string, index?: number) => {
      const created = await browser.bookmarks.create({ parentId: parent, title: n.title, url: n.url, index })
      ids.set(n.id, created.id)
      for (const c of n.children ?? []) if (c.type !== 'separator') await restore(c, created.id)
    }
    await restore(sub, parentId, sub.index)
    return ids
  }
}
