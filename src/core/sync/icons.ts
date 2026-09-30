import { ctx } from './ctx'

const CELL = 32

export async function exportIcons(): Promise<{ hosts: string[]; data: Uint8Array } | null> {
  const { knownIcons, loadIcons, sprite } = ctx.fav
  const ok = await loadIcons([...knownIcons().values()])
  if (!ok.length) return null
  const blob = await sprite(ok, CELL, 0, 'image/webp')
  if (!blob) return null
  return { hosts: ok.map(([b]) => b.host), data: new Uint8Array(await blob.arrayBuffer()) }
}

export function exportColors(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [h, c] of ctx.fav.colors) if (c[0] === '#') out[h] = c
  return out
}

export async function importIcons(hosts: string[], data: Uint8Array | undefined, remote: Record<string, string>) {
  const { ATLAS_COLS, attempted, colors, fetched, iconDb, rebuildAtlas, saveColors, setFetched } = ctx.fav
  const has = (h: string) => fetched.has(h) || colors.get(h)?.[0] === '#'
  const want = hosts.flatMap((h, i) => (has(h) ? [] : [[h, i] as const]))
  for (const [h, c] of Object.entries(remote)) if (!has(h) && /^#[0-9a-f]{6}$/i.test(c)) colors.set(h, c)
  saveColors()
  if (!data || !want.length) return 0
  const bmp = await createImageBitmap(new Blob([data as BlobPart]))
  const cell = bmp.width / ATLAS_COLS
  const cv = document.createElement('canvas')
  cv.width = cv.height = cell
  const g = cv.getContext('2d')!
  let n = 0
  for (const [h, i] of want) {
    g.clearRect(0, 0, cell, cell)
    g.drawImage(bmp, (i % ATLAS_COLS) * cell, Math.floor(i / ATLAS_COLS) * cell, cell, cell, 0, 0, cell, cell)
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'))
    if (!blob) continue
    await iconDb.set(h, { blob, ts: Date.now() }).catch(() => {})
    attempted.set(h, Date.now())
    setFetched(h, blob)
    n++
  }
  bmp.close()
  rebuildAtlas()
  return n
}
