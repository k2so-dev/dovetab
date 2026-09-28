const MAX = 50
const DELAY = 60

const links = new Map<string, HTMLLinkElement>()

function hint(rel: 'dns-prefetch' | 'preconnect', origin: string) {
  const key = `${rel} ${origin}`
  if (links.has(key)) return
  const l = document.createElement('link')
  l.rel = rel
  l.href = origin
  document.head.append(l)
  links.set(key, l)
  if (links.size > MAX) {
    const [k, old] = links.entries().next().value!
    old.remove()
    links.delete(k)
  }
}

function originOf(t: EventTarget | null): string | null {
  const a = t instanceof Element ? t.closest<HTMLAnchorElement>('a[href^="http"]') : null
  if (!a) return null
  try {
    return new URL(a.href).origin
  } catch {
    return null
  }
}

export function initWarmup(root: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const over = (e: PointerEvent) => {
    clearTimeout(timer)
    const o = originOf(e.target)
    if (o) timer = setTimeout(() => hint('dns-prefetch', o), DELAY)
  }
  const out = () => clearTimeout(timer)
  const down = (e: PointerEvent) => {
    const o = originOf(e.target)
    if (o) hint('preconnect', o)
  }
  root.addEventListener('pointerover', over)
  root.addEventListener('pointerout', out)
  root.addEventListener('pointerdown', down)
  return () => {
    clearTimeout(timer)
    root.removeEventListener('pointerover', over)
    root.removeEventListener('pointerout', out)
    root.removeEventListener('pointerdown', down)
  }
}
