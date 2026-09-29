const PREFIX = 'dovetab-sync:'
const MAGIC = 'DOVETAB1'
const ITER = 600_000

const b64u = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export function toB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(t)
  return new Uint8Array(await new Response(s).arrayBuffer())
}
export const gzip = (d: Uint8Array) => pipe(d, new CompressionStream('gzip'))
export const gunzip = (d: Uint8Array) => pipe(d, new DecompressionStream('gzip'))

export async function seal(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, (await gzip(data)) as BufferSource),
  )
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return out
}

export async function unseal(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  let pt: ArrayBuffer
  try {
    pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12))
  } catch {
    throw new Error('Wrong key or password')
  }
  return gunzip(new Uint8Array(pt))
}

export const newSyncKey = () => PREFIX + b64u(crypto.getRandomValues(new Uint8Array(32)))

export function parseSyncKey(s: string): Uint8Array | null {
  const m = s.trim().match(/dovetab-sync:([A-Za-z0-9_-]{43})/)
  if (!m) return null
  try {
    return unb64u(m[1]!)
  } catch {
    return null
  }
}

export async function keysFrom(secret: Uint8Array): Promise<{ aes: CryptoKey; nostr: Uint8Array }> {
  const base = await crypto.subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveKey', 'deriveBits'])
  const info = (s: string) => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(),
    info: new TextEncoder().encode(s),
  })
  const aes = await crypto.subtle.deriveKey(info('dovetab aes'), base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  const nostr = new Uint8Array(await crypto.subtle.deriveBits(info('dovetab nostr'), base, 256))
  return { aes, nostr }
}

async function passwordKey(password: string, salt: Uint8Array, iter: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function lockFile(password: string, data: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const head = new TextEncoder().encode(JSON.stringify({ kdf: 'pbkdf2-sha256', iter: ITER, salt: b64u(salt) }))
  const body = await seal(await passwordKey(password, salt, ITER), data)
  const out = new Uint8Array(8 + 4 + head.length + body.length)
  out.set(new TextEncoder().encode(MAGIC))
  new DataView(out.buffer).setUint32(8, head.length)
  out.set(head, 12)
  out.set(body, 12 + head.length)
  return out
}

export async function unlockFile(password: string, file: Uint8Array): Promise<Uint8Array> {
  if (new TextDecoder().decode(file.subarray(0, 8)) !== MAGIC) throw new Error('Not a Dovetab file')
  const len = new DataView(file.buffer, file.byteOffset).getUint32(8)
  const head = JSON.parse(new TextDecoder().decode(file.subarray(12, 12 + len))) as { iter: number; salt: string }
  return unseal(await passwordKey(password, unb64u(head.salt), head.iter), file.subarray(12 + len))
}
