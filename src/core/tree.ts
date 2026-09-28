export interface RawNode {
  id: string
  parentId?: string
  title: string
  url?: string
  type?: string
  dateAdded?: number
  index?: number
  children?: RawNode[]
}

export interface Bookmark {
  id: string
  parentId: string
  title: string
  url: string
  host: string
  dateAdded: number
  index: number
}

export interface Folder {
  id: string
  parentId: string | null
  title: string
  index: number
  depth: number
  locked: boolean
  folders: string[]
  bookmarks: string[]
}

export interface Model {
  roots: string[]
  folders: Map<string, Folder>
  bookmarks: Map<string, Bookmark>
}

export function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return u.host.replace(/^www\./, '') || u.protocol.replace(':', '')
  } catch {
    return url
  }
}

const isBookmark = (n: RawNode) => !!n.url && n.type !== 'separator' && !n.url.startsWith('place:')

export function buildModel(tree: RawNode[]): Model {
  const folders = new Map<string, Folder>()
  const bookmarks = new Map<string, Bookmark>()
  const top = tree[0]?.children ?? []

  const walk = (n: RawNode, parentId: string | null, depth: number) => {
    const f: Folder = {
      id: n.id,
      parentId,
      title: n.title || 'Untitled',
      index: n.index ?? 0,
      depth,
      locked: depth === 0,
      folders: [],
      bookmarks: [],
    }
    folders.set(n.id, f)
    for (const c of n.children ?? []) {
      if (c.children || (!c.url && c.type !== 'separator')) {
        f.folders.push(c.id)
        walk(c, n.id, depth + 1)
      } else if (isBookmark(c)) {
        f.bookmarks.push(c.id)
        bookmarks.set(c.id, {
          id: c.id,
          parentId: n.id,
          title: c.title || hostOf(c.url!),
          url: c.url!,
          host: hostOf(c.url!),
          dateAdded: c.dateAdded ?? 0,
          index: c.index ?? 0,
        })
      }
    }
  }
  for (const r of top) walk(r, null, 0)
  return { roots: top.map((r) => r.id), folders, bookmarks }
}

export function descendants(m: Model, id: string): string[] {
  const out: string[] = []
  const go = (fid: string) => {
    const f = m.folders.get(fid)
    if (!f) return
    out.push(fid)
    f.folders.forEach(go)
  }
  go(id)
  return out
}

export function ancestors(m: Model, id: string): Folder[] {
  const out: Folder[] = []
  let f = m.folders.get(m.folders.get(id)?.parentId ?? '')
  while (f) {
    out.unshift(f)
    f = f.parentId ? m.folders.get(f.parentId) : undefined
  }
  return out
}

export function flatFolders(m: Model): Folder[] {
  return m.roots.flatMap((r) => descendants(m, r)).map((id) => m.folders.get(id)!)
}

export function isInside(m: Model, id: string, ancestorId: string): boolean {
  let f = m.folders.get(id)
  while (f) {
    if (f.id === ancestorId) return true
    f = f.parentId ? m.folders.get(f.parentId) : undefined
  }
  return false
}
