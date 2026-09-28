const MAX = 50
const DELAY = 60

const links = new Map<string, HTMLLinkElement>()

function prefetch(origin: string) {
  if (links.has(origin)) return
  const l = document.createElement('link')
  l.rel = 'dns-prefetch'
  l.href = origin
  document.head.append(l)
  links.set(origin, l)
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
    if (o) timer = setTimeout(() => prefetch(o), DELAY)
  }
  const out = () => clearTimeout(timer)
  root.addEventListener('pointerover', over)
  root.addEventListener('pointerout', out)
  return () => {
    clearTimeout(timer)
    root.removeEventListener('pointerover', over)
    root.removeEventListener('pointerout', out)
  }
}
