export const NEUTRAL = '#8b8b94'

function hex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

export function dominantColor(data: Uint8ClampedArray | number[]): string {
  const BUCKETS = 12
  const acc = Array.from({ length: BUCKETS }, () => ({ w: 0, r: 0, g: 0, b: 0 }))
  let opaque = 0
  let colorful = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const a = data[i + 3]!
    if (a < 128) continue
    opaque++
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max ? (max - min) / max : 0
    if (sat < 0.28 || max < 50) continue
    let h: number
    const d = max - min
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    const bucket = acc[Math.floor((h / 6) * BUCKETS) % BUCKETS]!
    const w = sat * (max / 255)
    bucket.w += w
    bucket.r += r * w
    bucket.g += g * w
    bucket.b += b * w
    colorful++
  }
  if (!opaque || colorful / opaque < 0.08) return NEUTRAL
  const top = acc.reduce((a, b) => (b.w > a.w ? b : a))
  return hex(top.r / top.w, top.g / top.w, top.b / top.w)
}

export function hashColor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return `hsl(${Math.abs(h) % 360} 58% 50%)`
}

let ctx: CanvasRenderingContext2D | null | undefined

export function pixelsOf(img: HTMLImageElement): Uint8ClampedArray | null {
  ctx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.canvas.width = ctx.canvas.height = 16
  ctx.clearRect(0, 0, 16, 16)
  try {
    ctx.drawImage(img, 0, 0, 16, 16)
    return ctx.getImageData(0, 0, 16, 16).data
  } catch {
    return null
  }
}

export function signature(px: Uint8ClampedArray): string {
  let h = 0
  for (let i = 0; i < px.length; i++) h = (h * 33 + px[i]!) | 0
  return String(h)
}
