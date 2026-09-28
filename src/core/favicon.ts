import { reactive, shallowRef, watch } from 'vue'
import { model } from './bookmarks'
import { dominantColor, hashColor, pixelsOf, signature } from './color'
import { openStore } from './idb'
import { chromeFavicon, hasPermission, isFirefox, later } from './platform'
import { settings } from './settings'
import type { Bookmark } from './tree'

const COLORS_KEY = 'shelf:colors'
const MISSING_TTL_DAYS = 7
const FETCH_TTL = 30 * 864e5
const today = () => Math.floor(Date.now() / 864e5)

function readColors(): [string, string][] {
  try {
    return Object.entries(JSON.parse(localStorage.getItem(COLORS_KEY) ?? '{}') as Record<string, string>)
  } catch {
    return []
  }
}
export const colors = reactive(new Map<string, string>(readColors()))
let saveTimer: ReturnType<typeof setTimeout> | undefined
function saveColors() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => localStorage.setItem(COLORS_KEY, JSON.stringify(Object.fromEntries(colors))), 500)
}

function isMissing(host: string) {
  const v = colors.get(host)
  return !!v && v[0] === '-' && today() - Number(v.slice(1)) < MISSING_TTL_DAYS
}

export function colorFor(host: string): string {
  const v = colors.get(host)
  return v && v[0] === '#' ? v : hashColor(host)
}

interface IconRec {
  blob: Blob | null
  ts: number
}
const db = openStore<IconRec>('shelf-icons', 'icons')
export const fetched = reactive(new Map<string, string>())
const attempted = new Map<string, number>()
export const iconsReady = shallowRef(false)
const siteIconsOn = shallowRef(false)

let defaultSig: Promise<string | null> = Promise.resolve(null)

export function initIcons(): Promise<void> {
  if (!isFirefox) defaultSig = chromeDefaultSignature()
  if (!settings.siteIcons) iconsReady.value = true
  const sync = async () => {
    siteIconsOn.value = settings.siteIcons && (await hasPermission({ origins: ['<all_urls>'] }))
  }
  void sync()
  watch(() => settings.siteIcons, sync)
  watch(
    () => !settings.icons && iconsReady.value && model.value,
    (m) => m && later(() => tint(m.bookmarks.values())),
    { immediate: true },
  )
  return db
    .entries()
    .then((entries) => {
      for (const [host, rec] of entries) {
        attempted.set(host, rec.ts)
        if (rec.blob) fetched.set(host, URL.createObjectURL(rec.blob))
      }
    })
    .catch(() => {})
    .finally(() => (iconsReady.value = true))
}

let tinting: Bookmark[] = []
function tint(bookmarks: Iterable<Bookmark>) {
  const hosts = new Map<string, Bookmark>()
  for (const b of bookmarks) if (!colors.has(b.host)) hosts.set(b.host, b)
  const start = !tinting.length
  tinting = [...hosts.values()]
  if (start) tintStep()
}
function tintStep() {
  for (const b of tinting.splice(0, 8)) {
    const url = settings.icons || colors.has(b.host) ? null : iconSrc(b)
    if (!url) continue
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => void onIconLoad(b, img)
    img.onerror = () => onIconError(b)
    img.src = url
  }
  if (tinting.length) requestIdleCallback(tintStep)
}

function chromeDefaultSignature(): Promise<string | null> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => {
      const px = pixelsOf(img)
      res(px && signature(px))
    }
    img.onerror = () => res(null)
    img.src = chromeFavicon('https://shelf.invalid/', 64)
  })
}

export function iconSrc(b: Bookmark): string | null {
  const f = fetched.get(b.host)
  if (f) return f
  if (!isFirefox && !isMissing(b.host)) return chromeFavicon(b.url, 64)
  maybeFetch(b)
  return null
}

export async function onIconLoad(b: Bookmark, img: HTMLImageElement) {
  const known = colors.get(b.host)
  const fromChrome = !fetched.has(b.host)
  if (known && img.naturalWidth >= 32) return
  const px = pixelsOf(img)
  if (!px) return
  if (fromChrome && signature(px) === (await defaultSig)) {
    colors.set(b.host, `-${today()}`)
    saveColors()
    maybeFetch(b)
    return
  }
  if (!known || known[0] === '-') {
    colors.set(b.host, dominantColor(px))
    saveColors()
  }
  if (fromChrome && img.naturalWidth < 32) maybeFetch(b)
}

export function onIconError(b: Bookmark) {
  if (fetched.has(b.host)) {
    URL.revokeObjectURL(fetched.get(b.host)!)
    fetched.delete(b.host)
    return
  }
  colors.set(b.host, `-${today()}`)
  saveColors()
}

export async function refreshIcon(b: Bookmark) {
  colors.delete(b.host)
  saveColors()
  const f = fetched.get(b.host)
  if (f) URL.revokeObjectURL(f)
  fetched.delete(b.host)
  attempted.delete(b.host)
  await db.del(b.host).catch(() => {})
  maybeFetch(b)
}

export async function clearIconCache() {
  for (const u of fetched.values()) URL.revokeObjectURL(u)
  fetched.clear()
  attempted.clear()
  colors.clear()
  localStorage.removeItem(COLORS_KEY)
  await db.clear().catch(() => {})
}

const queue: Bookmark[] = []
const queued = new Set<string>()
let running = 0
const CONCURRENCY = 4

function maybeFetch(b: Bookmark) {
  if (!siteIconsOn.value || !iconsReady.value || queued.has(b.host) || !/^https?:/.test(b.url)) return
  const t = attempted.get(b.host)
  if (t && Date.now() - t < FETCH_TTL) return
  queued.add(b.host)
  queue.push(b)
  pump()
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const b = queue.shift()!
    running++
    const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn) : setTimeout(fn))
    idle(async () => {
      try {
        const blob = await fetchIcon(b.url)
        attempted.set(b.host, Date.now())
        await db.set(b.host, { blob, ts: Date.now() }).catch(() => {})
        if (blob) {
          colors.delete(b.host)
          fetched.set(b.host, URL.createObjectURL(blob))
        }
      } finally {
        running--
        queued.delete(b.host)
        pump()
      }
    })
  }
}

interface Candidate {
  href: string
  size: number
}

export function iconCandidates(html: string, base: string): Candidate[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: Candidate[] = []
  for (const l of doc.querySelectorAll<HTMLLinkElement>('link[rel][href]')) {
    const rel = l.getAttribute('rel')!.toLowerCase().split(/\s+/)
    const apple = rel.some((r) => r.startsWith('apple-touch-icon'))
    if (!apple && !rel.includes('icon')) continue
    const href = l.getAttribute('href')!
    const sizes = l.getAttribute('sizes') ?? ''
    const svg = /\.svg(\?|$)/i.test(href) || l.getAttribute('type') === 'image/svg+xml' || sizes === 'any'
    const size = svg ? 128 : Math.max(0, ...sizes.split(/\s+/).map((s) => parseInt(s, 10) || 0)) || (apple ? 180 : 16)
    try {
      out.push({ href: new URL(href, base).href, size })
    } catch {}
  }
  const rank = (c: Candidate) => (c.size >= 32 ? 1000 - Math.abs(Math.log2(c.size / 128)) * 100 : c.size)
  return out.sort((a, b) => rank(b) - rank(a))
}

async function fetchIcon(pageUrl: string): Promise<Blob | null> {
  const origin = new URL(pageUrl).origin
  const opts: RequestInit = { credentials: 'omit', signal: AbortSignal.timeout(8000) }
  let cands: Candidate[] = []
  try {
    const r = await fetch(origin + '/', opts)
    if (r.ok && (r.headers.get('content-type') ?? '').includes('html')) cands = iconCandidates(await r.text(), r.url)
  } catch {}
  cands.push({ href: origin + '/apple-touch-icon.png', size: 180 }, { href: origin + '/favicon.ico', size: 16 })
  const seen = new Set<string>()
  for (const c of cands) {
    if (seen.has(c.href)) continue
    seen.add(c.href)
    try {
      const r = await fetch(c.href, { ...opts, signal: AbortSignal.timeout(8000) })
      const type = r.headers.get('content-type') ?? ''
      if (!r.ok || !(type.startsWith('image/') || /\.ico(\?|$)/.test(c.href))) continue
      const blob = await r.blob()
      if (blob.size > 0 && blob.size < 400_000) return blob
    } catch {}
  }
  return null
}
