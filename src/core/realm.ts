const DOM = [
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'HTMLImageElement',
  'HTMLInputElement',
  'CharacterData',
  'Text',
  'Comment',
  'Document',
  'DocumentFragment',
  'ShadowRoot',
] as const

const native = Function.prototype[Symbol.hasInstance]

function sameName(C: Function, v: unknown): boolean {
  if (native.call(C, v)) return true
  if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return false
  for (let p = Object.getPrototypeOf(v); p; p = Object.getPrototypeOf(p))
    if ((p as { constructor?: Function }).constructor?.name === C.name) return true
  return false
}

export function fixRealm() {
  if (document.createTextNode('') instanceof Node) return
  for (const name of DOM) {
    const C = (globalThis as unknown as Record<string, Function | undefined>)[name]
    if (C) Object.defineProperty(C, Symbol.hasInstance, { value: (v: unknown) => sameName(C, v) })
  }
}
