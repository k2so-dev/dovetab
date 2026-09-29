import type { batch } from '../bookmarks'
import type * as Fav from '../favicon'
import type { browser } from '../platform'
import type { Settings } from '../settings'
import type { toast } from '../ui'

export interface Ctx {
  browser: typeof browser
  isFirefox: boolean
  settings: Settings
  batch: typeof batch
  toast: typeof toast
  fav: typeof Fav
}

export let ctx: Ctx

export function init(c: Ctx) {
  ctx = c
}
