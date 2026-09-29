import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { fromB64, toB64 } from './crypto'

export const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom']
const KIND = 30078
const CHUNK = 45_000
const TIMEOUT = 10_000

interface Event {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

const hash = (e: Omit<Event, 'id' | 'sig'>) =>
  sha256(new TextEncoder().encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])))

const tag = (e: Event, k: string) => e.tags.find((t) => t[0] === k)?.[1]

function sign(sk: Uint8Array, tags: string[][], content: string, at: number): Event {
  const e = { pubkey: bytesToHex(schnorr.getPublicKey(sk)), created_at: at, kind: KIND, tags, content }
  const id = hash(e)
  return { ...e, id: bytesToHex(id), sig: bytesToHex(schnorr.sign(id, sk)) }
}

function valid(e: Event, pub: string): boolean {
  try {
    const id = hash(e)
    return (
      e.pubkey === pub &&
      e.kind === KIND &&
      bytesToHex(id) === e.id &&
      schnorr.verify(hexToBytes(e.sig), id, hexToBytes(pub))
    )
  } catch {
    return false
  }
}

function talk(url: string, send: unknown[][], onMsg: (d: unknown[]) => boolean): Promise<boolean> {
  return new Promise((res) => {
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      return res(false)
    }
    const end = (ok: boolean) => {
      clearTimeout(timer)
      ws.close()
      res(ok)
    }
    const timer = setTimeout(() => end(false), TIMEOUT)
    ws.onopen = () => send.forEach((m) => ws.send(JSON.stringify(m)))
    ws.onmessage = (m) => {
      try {
        if (onMsg(JSON.parse(String(m.data)) as unknown[])) end(true)
      } catch {}
    }
    ws.onerror = () => end(false)
  })
}

export async function push(sk: Uint8Array, data: Uint8Array, ts: number, relays = RELAYS): Promise<number> {
  const n = Math.ceil(data.length / CHUNK)
  const at = Math.floor(Date.now() / 1000)
  const events = Array.from({ length: n }, (_, i) =>
    sign(
      sk,
      [
        ['d', `dovetab:${i}`],
        ['n', String(n)],
        ['ts', String(ts)],
      ],
      toB64(data.subarray(i * CHUNK, (i + 1) * CHUNK)),
      at,
    ),
  )
  const ids = new Set(events.map((e) => e.id))
  const results = await Promise.all(
    relays.map((url) => {
      const ok = new Set<string>()
      let failed = false
      return talk(
        url,
        events.map((e) => ['EVENT', e]),
        (d) => {
          if (d[0] !== 'OK' || !ids.has(d[1] as string)) return false
          if (d[2]) ok.add(d[1] as string)
          else failed = true
          return failed || ok.size === ids.size
        },
      ).then((done) => done && !failed)
    }),
  )
  return results.filter(Boolean).length
}

export async function pull(sk: Uint8Array, relays = RELAYS): Promise<Uint8Array | null> {
  const pub = bytesToHex(schnorr.getPublicKey(sk))
  const byTs = new Map<string, Map<number, Event>>()
  await Promise.all(
    relays.map((url) =>
      talk(url, [['REQ', 'd', { kinds: [KIND], authors: [pub], limit: 200 }]], (d) => {
        if (d[0] === 'EOSE' || d[0] === 'CLOSED') return true
        if (d[0] !== 'EVENT') return false
        const e = d[2] as Event
        const ts = tag(e, 'ts')
        const i = Number(tag(e, 'd')?.replace('dovetab:', ''))
        if (!ts || !Number.isInteger(i) || !valid(e, pub)) return false
        if (!byTs.has(ts)) byTs.set(ts, new Map())
        byTs.get(ts)!.set(i, e)
        return false
      }),
    ),
  )
  const sets = [...byTs].sort((a, b) => Number(b[0]) - Number(a[0]))
  for (const [, chunks] of sets) {
    const n = Number(tag(chunks.values().next().value!, 'n'))
    if (!n || chunks.size < n) continue
    const parts = Array.from({ length: n }, (_, i) => chunks.get(i))
    if (parts.some((p) => !p)) continue
    const bytes = parts.map((p) => fromB64(p!.content))
    const out = new Uint8Array(bytes.reduce((s, b) => s + b.length, 0))
    let o = 0
    for (const b of bytes) {
      out.set(b, o)
      o += b.length
    }
    return out
  }
  return null
}
