import { reactive, shallowRef, watch } from 'vue'
import { model } from './bookmarks'
import { dominantColor, hashColor, pixelsOf, signature } from './color'
import { openStore } from './idb'
import { chromeFavicon, hasPermission, idle, isFirefox, later } from './platform'
import { settings } from './settings'
import type { Bookmark } from './tree'

const COLORS_KEY = 'dovetab:colors'
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
const db = openStore<IconRec>('dovetab-icons', 'icons')
interface AtlasRec {
  blob: Blob
  hosts: string[]
  cell: number
  ts: number
}
const atlasDb = openStore<AtlasRec>('dovetab-atlas', 'atlas')
const ATLAS_KEY = 'dovetab:atlas'
const ATLAS_COLS = 16
const ATLAS_MAX = 512
const ATLAS_TTL = 7 * 864e5
export const atlas = shallowRef(new Map<string, string>())
let atlasRec: AtlasRec | undefined
let atlasImg: HTMLImageElement | undefined
export const hasAtlas = () => !!localStorage.getItem(ATLAS_KEY)
export const fetched = reactive(new Map<string, string>())
const attempted = new Map<string, number>()
export const iconsReady = shallowRef(false)
const siteIconsOn = shallowRef(false)

let defaultSig: Promise<string | null> = Promise.resolve(null)
const NO_FAVICON_KEY = 'dovetab:nofavicon'
const noFavicon = shallowRef(Date.now() - Number(localStorage.getItem(NO_FAVICON_KEY) ?? 0) < MISSING_TTL_DAYS * 864e5)
const browserIcons = () => !isFirefox && !noFavicon.value

export function initIcons(): Promise<void> {
  if (browserIcons()) defaultSig = chromeDefaultSignature()
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
  const cache = db
    .entries()
    .then((entries) => {
      for (const [host, rec] of entries) {
        attempted.set(host, rec.ts)
        if (rec.blob) fetched.set(host, URL.createObjectURL(rec.blob))
      }
    })
    .catch(() => {})
    .finally(() => (iconsReady.value = true))
  later(() => void buildAtlas(), 4000)
  return Promise.all([cache, loadAtlas().catch(() => {})]).then(() => {})
}

async function loadAtlas() {
  if (!settings.icons || !hasAtlas()) return
  const rec = await atlasDb.get('atlas')
  if (!rec) return
  const url = URL.createObjectURL(rec.blob)
  const img = new Image()
  img.src = url
  await img.decode()
  atlasRec = rec
  atlasImg = img
  const rows = Math.ceil(rec.hosts.length / ATLAS_COLS)
  const st = document.documentElement.style
  st.setProperty('--atlas', `url(${url})`)
  st.setProperty('--atlas-size', `${ATLAS_COLS * 100}% ${rows * 100}%`)
  const pct = (i: number, n: number) => (n > 1 ? (i / (n - 1)) * 100 : 0)
  atlas.value = new Map(
    rec.hosts.map((h, i) => [h, `${pct(i % ATLAS_COLS, ATLAS_COLS)}% ${pct(Math.floor(i / ATLAS_COLS), rows)}%`]),
  )
}

function dropAtlas(host: string) {
  if (!atlas.value.has(host)) return
  const m = new Map(atlas.value)
  m.delete(host)
  atlas.value = m
  if (atlasRec) atlasRec.ts = 0
}

async function buildAtlas() {
  if (!settings.icons) return
  const cell = devicePixelRatio > 2 ? 64 : 48
  const list = new Map<string, Bookmark>()
  for (const b of model.value.bookmarks.values()) {
    if (list.size >= ATLAS_MAX) break
    if (!list.has(b.host) && colors.get(b.host)?.[0] === '#' && iconSrc(b)) list.set(b.host, b)
  }
  const prev = atlasRec && new Set(atlasRec.hosts)
  if (
    prev &&
    atlasRec!.cell === cell &&
    Date.now() - atlasRec!.ts < ATLAS_TTL &&
    prev.size === list.size &&
    [...list.keys()].every((h) => prev.has(h))
  )
    return
  const items = [...list.values()]
  const imgs = await Promise.all(
    items.map(
      (b) =>
        new Promise<HTMLImageElement | null>((res) => {
          const img = new Image()
          img.onload = () => res(img.naturalWidth ? img : null)
          img.onerror = () => res(null)
          img.src = iconSrc(b) ?? ''
        }),
    ),
  )
  const sig = await defaultSig
  const globe = (b: Bookmark, img: HTMLImageElement) => {
    if (!sig || fetched.has(b.host)) return false
    const px = pixelsOf(img)
    return !!px && signature(px) === sig
  }
  const ok = items.flatMap((b, i) => (imgs[i] && !globe(b, imgs[i]) ? [[b, imgs[i]] as const] : []))
  if (!ok.length) return
  const cv = document.createElement('canvas')
  cv.width = ATLAS_COLS * cell
  cv.height = Math.ceil(ok.length / ATLAS_COLS) * cell
  const g = cv.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  ok.forEach(([b, img], i) => {
    g.drawImage(img, (i % ATLAS_COLS) * cell + 1, Math.floor(i / ATLAS_COLS) * cell + 1, cell - 2, cell - 2)
    if (!fetched.has(b.host) && img.naturalWidth < 32) maybeFetch(b)
  })
  const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'))
  if (!blob) return
  await atlasDb.set('atlas', { blob, hosts: ok.map(([b]) => b.host), cell, ts: Date.now() })
  localStorage.setItem(ATLAS_KEY, '1')
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
  if (tinting.length) idle(tintStep)
}

function chromeDefaultSignature(): Promise<string | null> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => {
      localStorage.removeItem(NO_FAVICON_KEY)
      const px = pixelsOf(img)
      res(px && signature(px))
    }
    img.onerror = () => {
      localStorage.setItem(NO_FAVICON_KEY, String(Date.now()))
      noFavicon.value = true
      res(null)
    }
    img.src = chromeFavicon('https://dovetab.invalid/', 64)
  })
}

export function iconSrc(b: Bookmark): string | null {
  const f = fetched.get(b.host)
  if (f) return f
  if (browserIcons() && !isMissing(b.host)) return chromeFavicon(b.url, 64)
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
  dropAtlas(b.host)
  await db.del(b.host).catch(() => {})
  maybeFetch(b)
}

export async function clearIconCache() {
  for (const u of fetched.values()) URL.revokeObjectURL(u)
  fetched.clear()
  attempted.clear()
  colors.clear()
  localStorage.removeItem(COLORS_KEY)
  localStorage.removeItem(ATLAS_KEY)
  atlas.value = new Map()
  atlasRec = atlasImg = undefined
  document.documentElement.style.removeProperty('--atlas')
  await Promise.all([db.clear(), atlasDb.clear()]).catch(() => {})
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
    idle(async () => {
      try {
        const blob = await fetchIcon(b.url)
        attempted.set(b.host, Date.now())
        await db.set(b.host, { blob, ts: Date.now() }).catch(() => {})
        if (blob) {
          dropAtlas(b.host)
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
