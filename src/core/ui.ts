import { reactive } from 'vue'
import { createBookmark, model, moveBookmark, removeNode, updateBookmark } from './bookmarks'
import { refreshIcon } from './favicon'
import { openMany, openUrl } from './platform'
import { local, settings, toggleIn } from './settings'
import { descendants, type Bookmark, type Folder } from './tree'
import { recordOpen } from './usage'
import { ALL, go } from './view'

export interface EditState {
  mode: 'edit' | 'new' | 'new-folder' | 'rename-folder'
  id?: string
  parentId: string
  title: string
  url: string
}

export interface MenuState {
  kind: 'bookmark' | 'folder'
  id: string
  x: number
  y: number
}

export const ui = reactive({
  menu: null as MenuState | null,
  edit: null as EditState | null,
  palette: false,
  seed: '',
  settings: false,
  confirm: null as { title: string; body: string; action: string; run: () => void } | null,
  toast: null as { text: string; undo?: () => Promise<unknown> } | null,
  drag: null as string | null,
  over: null as string | null,
  overFolder: null as string | null,
})

export function closeOverlays() {
  ui.menu = null
  ui.edit = null
  ui.palette = false
  ui.settings = false
  ui.confirm = null
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string, undo?: () => Promise<unknown>) {
  clearTimeout(toastTimer)
  ui.toast = { text, undo }
  toastTimer = setTimeout(() => (ui.toast = null), 6000)
}
export async function runUndo() {
  const u = ui.toast?.undo
  clearTimeout(toastTimer)
  ui.toast = null
  await u?.()
}

export function openBookmark(b: Bookmark, where?: 'tab' | 'current' | 'window' | 'incognito' | 'background') {
  recordOpen(b.url)
  return openUrl(b.url, where ?? (settings.newTab ? 'tab' : 'current'))
}

export function onBookmarkClick(e: MouseEvent, b: Bookmark) {
  if (e.button === 2) return
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
    recordOpen(b.url)
    return
  }
  e.preventDefault()
  void openBookmark(b)
}

export async function deleteBookmark(b: Bookmark) {
  ui.menu = null
  ui.edit = null
  const restore = await removeNode(b.id)
  toast(`Deleted “${b.title}”`, restore)
}

export function deleteFolder(f: Folder) {
  ui.menu = null
  const m = model.value
  const n = descendants(m, f.id).reduce((a, id) => a + m.folders.get(id)!.bookmarks.length, 0)
  ui.confirm = {
    title: `Delete “${f.title}”?`,
    body: n
      ? `This folder and its ${n} bookmark${n === 1 ? '' : 's'} will be removed from your browser.`
      : 'This empty folder will be removed from your browser.',
    action: 'Delete folder',
    run: async () => {
      ui.confirm = null
      if (local.view === f.id || descendants(m, f.id).includes(local.view)) local.view = f.parentId ?? ALL
      const restore = await removeNode(f.id)
      toast(`Deleted “${f.title}”`, async () => {
        const ids = await restore()
        const back = ids.get(f.id)
        if (back) go(back)
      })
    },
  }
}

export function togglePin(b: Bookmark) {
  toggleIn(settings.pins, b.url)
  ui.menu = null
}

export function hideBookmark(b: Bookmark) {
  if (!settings.hidden.includes(b.url)) settings.hidden.push(b.url)
  ui.menu = null
  toast(`Hidden “${b.title}”`, async () => toggleIn(settings.hidden, b.url))
}

export async function copyLink(b: Bookmark) {
  ui.menu = null
  await navigator.clipboard.writeText(b.url)
  toast('Link copied')
}

export async function moveTo(b: Bookmark, folderId: string) {
  ui.menu = null
  if (b.parentId !== folderId) await moveBookmark(b.id, folderId)
}

export function refreshBookmarkIcon(b: Bookmark) {
  ui.menu = null
  void refreshIcon(b)
}

export function editBookmark(b: Bookmark) {
  ui.menu = null
  ui.edit = { mode: 'edit', id: b.id, parentId: b.parentId, title: b.title, url: b.url }
}

export function newBookmark(parentId: string) {
  ui.menu = null
  ui.edit = { mode: 'new', parentId, title: '', url: 'https://' }
}

export function newFolder(parentId: string) {
  ui.menu = null
  ui.edit = { mode: 'new-folder', parentId, title: '', url: '' }
}

export function renameFolder(f: Folder) {
  ui.menu = null
  ui.edit = { mode: 'rename-folder', id: f.id, parentId: f.parentId ?? '', title: f.title, url: '' }
}

export function normalizeUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s
  return 'https://' + s
}

export async function saveEdit() {
  const e = ui.edit
  if (!e) return
  const title = e.title.trim()
  ui.edit = null
  switch (e.mode) {
    case 'edit': {
      const b = model.value.bookmarks.get(e.id!)
      const url = normalizeUrl(e.url)
      await updateBookmark(e.id!, { title: title || url, url })
      if (b && b.url !== url) {
        for (const list of [settings.pins, settings.hidden]) {
          const i = list.indexOf(b.url)
          if (i >= 0) list[i] = url
        }
      }
      if (b && b.parentId !== e.parentId) await moveBookmark(e.id!, e.parentId)
      break
    }
    case 'new': {
      const url = normalizeUrl(e.url)
      await createBookmark(e.parentId, title || url, url)
      break
    }
    case 'new-folder':
      await createBookmark(e.parentId, title || 'New folder')
      break
    case 'rename-folder':
      await updateBookmark(e.id!, { title: title || 'Untitled' })
      break
  }
}

export function openFolder(f: Folder, where: 'tab' | 'window' | 'incognito' | 'group') {
  ui.menu = null
  const m = model.value
  const urls = descendants(m, f.id).flatMap((id) => m.folders.get(id)!.bookmarks.map((b) => m.bookmarks.get(b)!.url))
  return openMany(urls, where)
}

export async function dropOnBookmark(target: Bookmark) {
  const id = ui.drag
  ui.drag = ui.over = ui.overFolder = null
  if (!id || id === target.id) return
  await moveBookmark(id, target.parentId, target.index)
}

export async function dropOnFolder(folderId: string) {
  const id = ui.drag
  ui.drag = ui.over = ui.overFolder = null
  if (!id) return
  const b = model.value.bookmarks.get(id)
  if (b && b.parentId !== folderId) await moveBookmark(id, folderId)
}
