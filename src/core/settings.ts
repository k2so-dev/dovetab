import { reactive, ref, watch } from 'vue'
import { browser } from './platform'
import type { SortKey } from './sort'

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  density: 'tiles' | 'list' | 'columns'
  width: 'full' | 'narrow'
  icons: boolean
  glow: 'off' | 'subtle' | 'normal'
  animations: boolean | null
  sort: SortKey
  dir: 'asc' | 'desc'
  newTab: boolean
  history: boolean
  siteIcons: boolean
  warmup: boolean
  pins: string[]
  hidden: string[]
}

export interface LocalState {
  view: string
  open: Record<string, boolean>
}

const DEFAULTS: Settings = {
  theme: 'system',
  density: 'list',
  width: 'full',
  icons: true,
  glow: 'subtle',
  animations: null,
  sort: 'browser',
  dir: 'asc',
  newTab: false,
  history: false,
  siteIcons: false,
  warmup: false,
  pins: [],
  hidden: [],
}

const KEY = 'shelf:settings'
const LOCAL_KEY = 'shelf:local'

function read<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<T>) }
  } catch {
    return fallback
  }
}

export const settings = reactive<Settings>(read(KEY, DEFAULTS))
export const local = reactive<LocalState>(read<LocalState>(LOCAL_KEY, { view: 'all', open: {} }))

const darkMq = matchMedia('(prefers-color-scheme: dark)')
const reduceMq = matchMedia('(prefers-reduced-motion: reduce)')
export const systemDark = ref(darkMq.matches)
darkMq.addEventListener('change', (e) => (systemDark.value = e.matches))

export const isDark = () => (settings.theme === 'system' ? systemDark.value : settings.theme === 'dark')
export const animationsOn = () => settings.animations ?? !reduceMq.matches

function apply() {
  const d = document.documentElement.dataset
  d.theme = settings.theme
  d.glow = settings.glow
  d.density = settings.density
  d.width = settings.width
  d.icons = settings.icons ? 'on' : 'off'
  d.motion = animationsOn() ? 'on' : 'off'
}

let lastSynced = ''
export function initSettings() {
  apply()
  watch(
    settings,
    () => {
      apply()
      const json = JSON.stringify(settings)
      localStorage.setItem(KEY, json)
      if (json !== lastSynced) {
        lastSynced = json
        browser.storage.sync.set({ settings: JSON.parse(json) }).catch(() => {})
      }
    },
    { deep: true },
  )
  watch(local, () => localStorage.setItem(LOCAL_KEY, JSON.stringify(local)), { deep: true })

  const adopt = (v: unknown) => {
    if (!v || typeof v !== 'object') return
    const json = JSON.stringify({ ...DEFAULTS, ...v })
    if (json === JSON.stringify(settings)) return
    lastSynced = json
    Object.assign(settings, JSON.parse(json))
  }
  browser.storage.sync.get('settings').then(
    (r) => adopt(r.settings),
    () => {},
  )
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) adopt(changes.settings.newValue)
  })
}

export function toggleIn(list: string[], v: string) {
  const i = list.indexOf(v)
  i < 0 ? list.push(v) : list.splice(i, 1)
}
