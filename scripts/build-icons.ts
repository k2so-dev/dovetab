import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ICONS = [
  'app-window',
  'arrow-down-up',
  'bookmark',
  'bookmark-plus',
  'check',
  'chevron-right',
  'columns-3',
  'copy',
  'ellipsis',
  'eye-off',
  'folder',
  'folder-input',
  'folder-open',
  'folder-plus',
  'globe',
  'history',
  'layers',
  'layout-grid',
  'link',
  'list',
  'moon',
  'pencil',
  'pin',
  'pin-off',
  'search',
  'sliders-horizontal',
  'sparkles',
  'square-arrow-out-up-right',
  'sun',
  'trash-2',
  'x',
] as const

const dir = fileURLToPath(new URL('../node_modules/lucide-static/icons/', import.meta.url))
const symbols = ICONS.map((name) => {
  const svg = readFileSync(`${dir}${name}.svg`, 'utf8')
  const body = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/\s*\n\s*/g, '')
  return `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`
}).join('')

const out = `export type IconName = ${ICONS.map((n) => `'${n}'`).join(' | ')}

export const sprite = ${JSON.stringify(
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${symbols}</svg>`,
)}
`
writeFileSync(fileURLToPath(new URL('../src/ui/icons.gen.ts', import.meta.url)), out)
console.log(`icons: ${ICONS.length} symbols`)
