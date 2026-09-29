<script setup lang="ts" vapor>
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { batch, model } from '@/core/bookmarks'
import * as fav from '@/core/favicon'
import { browser, dropPermission, isFirefox, modKey, requestPermission, type Perm } from '@/core/platform'
import { ago } from '@/core/score'
import { animationsOn, settings, toggleIn } from '@/core/settings'
import type { Incoming } from '@/core/sync'
import { hostOf } from '@/core/tree'
import { toast, ui } from '@/core/ui'
import { clearStats, historyGranted } from '@/core/usage'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import Segmented from './Segmented.vue'
import Switch from './Switch.vue'

const version = browser.runtime.getManifest().version

const hidden = computed(() =>
  settings.hidden.map((url) => {
    const b = [...model.value.bookmarks.values()].find((x) => x.url === url)
    return { url, title: b?.title ?? url, host: hostOf(url) }
  }),
)

async function toggleOptional(key: 'history' | 'siteIcons') {
  const perm: Perm = key === 'history' ? { permissions: ['history'] } : { origins: ['<all_urls>'] }
  if (!settings[key]) {
    if (!(await requestPermission(perm))) return
    if (key === 'history') historyGranted.value = true
    settings[key] = true
  } else {
    settings[key] = false
    await dropPermission(perm)
  }
}

const animations = computed({
  get: animationsOn,
  set: (v: boolean) => (settings.animations = v),
})

async function clearIcons() {
  await fav.clearIconCache()
  toast('Icon cache cleared')
}
const SYNC_KEY = 'dovetab:sync'
interface SyncMeta {
  key: string
  icons: boolean
  last: { at: number; dir: 'up' | 'down'; from: string } | null
}
function readSync(): SyncMeta {
  try {
    return { key: '', icons: true, last: null, ...JSON.parse(localStorage.getItem(SYNC_KEY) ?? '{}') }
  } catch {
    return { key: '', icons: true, last: null }
  }
}
const sync = reactive<SyncMeta>(readSync())
watch(sync, () => localStorage.setItem(SYNC_KEY, JSON.stringify(sync)), { deep: true })
const lib = async () => {
  const s = await import('@/core/sync')
  s.init({ browser, isFirefox, settings, batch, toast, fav })
  return s
}
const busy = ref('')
const pasting = ref(false)
const pasted = ref('')
const incoming = shallowRef<Incoming | null>(null)
const fileMode = ref<'export' | 'import' | null>(null)
const password = ref('')
const picker = ref<HTMLInputElement>()

async function task(label: string, fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = label
  try {
    await fn()
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Sync failed')
  } finally {
    busy.value = ''
  }
}

const createKey = () => task('Creating…', async () => void (sync.key = (await lib()).newSyncKey()))
function savePasted() {
  const k = pasted.value.match(/dovetab-sync:[A-Za-z0-9_-]{43}/)?.[0]
  if (!k) return toast('That is not a Dovetab sync key')
  sync.key = k
  pasting.value = false
  pasted.value = ''
}
async function copyKey() {
  await navigator.clipboard.writeText(sync.key)
  toast('Sync key copied')
}
function forgetKey() {
  const k = sync.key
  sync.key = ''
  sync.last = null
  incoming.value = null
  toast('Sync key removed', async () => void (sync.key = k))
}
const upload = () =>
  task('Uploading…', async () => {
    const n = await (await lib()).upload(sync.key, sync.icons)
    sync.last = { at: Date.now(), dir: 'up', from: 'this browser' }
    toast(`Uploaded to ${n} relay${n === 1 ? '' : 's'}`)
  })
const download = () =>
  task('Downloading…', async () => {
    incoming.value = await (await lib()).download(sync.key)
    if (!incoming.value) toast('Nothing uploaded with this key yet')
  })
const apply = () =>
  task('Applying…', async () => {
    const inc = incoming.value!
    await inc.apply()
    if (fileMode.value !== 'import') sync.last = { at: Date.now(), dir: 'down', from: inc.from }
    incoming.value = null
    fileMode.value = null
    ui.settings = false
  })
function startFile(mode: 'export' | 'import') {
  fileMode.value = fileMode.value === mode ? null : mode
  password.value = ''
  incoming.value = null
}
const exportFile = () =>
  task('Exporting…', async () => {
    await (await lib()).exportFile(password.value, sync.icons)
    fileMode.value = null
    password.value = ''
  })
function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  void task('Decrypting…', async () => {
    incoming.value = await (await lib()).importFile(f, password.value)
    password.value = ''
  })
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const preview = computed(() => {
  const i = incoming.value
  if (!i) return ''
  const parts = [
    i.add && `+${plural(i.add, 'new item')}`,
    i.remove && `−${plural(i.remove, 'removed item')}`,
    i.move && plural(i.move, 'move'),
    i.settings && plural(i.settings, 'setting'),
    i.icons && plural(i.icons, 'icon'),
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Already in sync'
})

function resetStats() {
  clearStats()
  toast('Usage stats cleared')
}
</script>

<template>
  <Modal :open="ui.settings" @close="ui.settings = false">
    <div class="flex max-h-[calc(100vh-48px)] w-[min(580px,calc(100vw-32px))] flex-col">
      <div class="flex items-center justify-between border-b border-border px-[22px] pt-[18px] pb-3.5">
        <div class="text-base font-semibold tracking-[-0.01em]">Settings</div>
        <button
          type="button"
          aria-label="Close"
          class="grid size-7 place-items-center rounded-md text-mfg hover:bg-accent hover:text-fg"
          @click="ui.settings = false"
        >
          <Icon name="x" :stroke="2" />
        </button>
      </div>

      <div class="overflow-auto px-[22px] pt-1.5 pb-[18px]">
        <div class="pt-4 pb-1.5 text-[11.5px] font-medium tracking-[.02em] text-mfg">APPEARANCE</div>
        <div class="flex items-center justify-between gap-4 py-2.5">
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Theme</div>
            <div class="mt-0.5 text-[12.5px] text-pretty text-mfg">System follows your OS setting.</div>
          </div>
          <Segmented
            v-model="settings.theme"
            :options="[
              ['system', 'System'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ]"
          />
        </div>
        <div class="flex items-center justify-between gap-4 py-2.5">
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Layout</div>
            <div class="mt-0.5 text-[12.5px] text-pretty text-mfg">
              Tiles to scan by icon, list for details, columns for dense folders.
            </div>
          </div>
          <Segmented
            v-model="settings.density"
            :options="[
              ['tiles', 'Tiles'],
              ['list', 'List'],
              ['columns', 'Columns'],
            ]"
          />
        </div>
        <label class="flex items-center justify-between gap-4 py-2.5">
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Title</div>
            <div class="mt-0.5 text-[12.5px] text-pretty text-mfg">Name at the top of the sidebar.</div>
          </div>
          <input
            v-model="settings.title"
            type="text"
            maxlength="40"
            placeholder="Dovetab"
            spellcheck="false"
            class="h-8 w-44 rounded-lg border border-border bg-input px-2.5 text-[13px] text-fg outline-0 focus:border-mfg focus:shadow-[0_0_0_3px_var(--ring)]"
          />
        </label>
        <div class="flex items-center justify-between gap-4 py-2.5">
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Width</div>
            <div class="mt-0.5 text-[12.5px] text-pretty text-mfg">Narrow keeps content centered on wide screens.</div>
          </div>
          <Segmented
            v-model="settings.width"
            :options="[
              ['full', 'Full'],
              ['narrow', 'Narrow'],
            ]"
          />
        </div>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 py-2.5 text-left"
          @click="settings.icons = !settings.icons"
        >
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Show icons</div>
            <div class="mt-0.5 text-[12.5px] text-pretty text-mfg">
              Site icons next to bookmarks. When off, cards keep their color glow.
            </div>
          </div>
          <Switch v-model="settings.icons" />
        </button>
        <div class="flex items-center justify-between gap-4 py-2.5">
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Icon glow</div>
            <div class="mt-0.5 text-[12.5px] text-pretty text-mfg">Soft tint from each site’s icon colors.</div>
          </div>
          <Segmented
            v-model="settings.glow"
            :options="[
              ['off', 'Off'],
              ['subtle', 'Subtle'],
              ['normal', 'Normal'],
            ]"
          />
        </div>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 py-2.5 text-left"
          @click="animations = !animations"
        >
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Animations</div>
            <div class="mt-0.5 text-[12.5px] text-pretty text-mfg">
              Small fades for menus and dialogs. Off by default if your system asks for reduced motion.
            </div>
          </div>
          <Switch v-model="animations" />
        </button>

        <div class="mt-2 border-t border-border pt-[18px] pb-1.5 text-[11.5px] font-medium tracking-[.02em] text-mfg">
          BEHAVIOUR
        </div>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 py-2.5 text-left"
          @click="toggleOptional('history')"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-[13.5px] font-medium">
              Use browsing history
              <span class="rounded border border-border px-1.5 py-px font-mono text-[10.5px] font-normal text-mfg"
                >history</span
              >
            </div>
            <div class="mt-0.5 max-w-[400px] text-[12.5px] text-pretty text-mfg">
              Improves Recommended with visits from the last 5 days and adds history to search. Nothing leaves your
              device.
            </div>
          </div>
          <Switch :model-value="settings.history && historyGranted" />
        </button>
        <button
          v-if="settings.history && historyGranted"
          type="button"
          class="flex w-full items-center justify-between gap-4 py-2.5 text-left"
          @click="settings.recent = !settings.recent"
        >
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Recently visited</div>
            <div class="mt-0.5 max-w-[400px] text-[12.5px] text-pretty text-mfg">
              Shows the last few pages you visited at the top of All bookmarks.
            </div>
          </div>
          <Switch :model-value="settings.recent" />
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 py-2.5 text-left"
          @click="toggleOptional('siteIcons')"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-[13.5px] font-medium">
              Fetch icons from sites
              <span class="rounded border border-border px-1.5 py-px font-mono text-[10.5px] font-normal text-mfg"
                >all sites</span
              >
            </div>
            <div class="mt-0.5 max-w-[400px] text-[12.5px] text-pretty text-mfg">
              Downloads a sharper icon straight from each bookmarked site when the browser has none or a low-res one.
              Falls back to a letter.
            </div>
          </div>
          <Switch :model-value="settings.siteIcons" />
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 py-2.5 text-left"
          @click="settings.newTab = !settings.newTab"
        >
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Open bookmarks in a new tab</div>
            <div class="mt-0.5 max-w-[400px] text-[12.5px] text-pretty text-mfg">
              Otherwise opens in this tab. {{ modKey }}-click always opens a new tab.
            </div>
          </div>
          <Switch v-model="settings.newTab" />
        </button>

        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 py-2.5 text-left"
          @click="settings.warmup = !settings.warmup"
        >
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Warm up links on hover</div>
            <div class="mt-0.5 max-w-[400px] text-[12.5px] text-pretty text-mfg">
              Looks up the site's address when you hover a bookmark, so it opens faster. The site's DNS resolver sees
              the lookup.
            </div>
          </div>
          <Switch v-model="settings.warmup" />
        </button>

        <div class="mt-2 border-t border-border pt-[18px] pb-1.5 text-[11.5px] font-medium tracking-[.02em] text-mfg">
          HIDDEN BOOKMARKS · {{ hidden.length }}
        </div>
        <div v-for="h in hidden" :key="h.url" class="flex h-10 items-center gap-2.5">
          <div
            class="grid size-5 flex-none place-items-center rounded-[5px] text-[10px] font-semibold text-white"
            :style="{ background: fav.colorFor(h.host) }"
          >
            {{ h.title[0]?.toUpperCase() }}
          </div>
          <div class="min-w-0 truncate text-[13.5px] font-medium">{{ h.title }}</div>
          <div class="min-w-0 flex-1 truncate text-[12.5px] text-mfg">{{ h.host }}</div>
          <button
            type="button"
            class="flex h-7 items-center rounded-md border border-border px-2.5 text-[12.5px] hover:bg-accent"
            @click="toggleIn(settings.hidden, h.url)"
          >
            Unhide
          </button>
        </div>
        <p v-if="!hidden.length" class="py-2 text-[12.5px] text-mfg">
          Nothing hidden. Use “Hide” in a bookmark’s menu to remove it from this page without deleting it.
        </p>

        <div class="mt-2 border-t border-border pt-[18px] pb-1.5 text-[11.5px] font-medium tracking-[.02em] text-mfg">
          SYNC
        </div>
        <p class="py-1 text-[12.5px] text-pretty text-mfg">
          Move settings, bookmarks and icons to another browser, by hand. Everything is encrypted on this device. With a
          sync key the data goes through public Nostr relays that only see random bytes; anyone with the key can read
          and replace it.
        </p>
        <div v-if="!sync.key && !pasting" class="flex flex-wrap gap-2 py-2">
          <button
            type="button"
            class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
            :disabled="!!busy"
            @click="createKey"
          >
            Create sync key
          </button>
          <button
            type="button"
            class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
            @click="pasting = true"
          >
            Paste sync key
          </button>
        </div>
        <form v-else-if="pasting" class="flex gap-2 py-2" @submit.prevent="savePasted">
          <input
            v-model="pasted"
            type="text"
            autofocus
            spellcheck="false"
            placeholder="dovetab-sync:…"
            class="h-8 min-w-0 flex-1 rounded-lg border border-border bg-input px-2.5 text-[13px] text-fg outline-0 focus:border-mfg focus:shadow-[0_0_0_3px_var(--ring)]"
          />
          <button
            type="submit"
            class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
            @click="pasting = false"
          >
            Cancel
          </button>
        </form>
        <template v-else>
          <div class="flex gap-2 py-2">
            <input
              :value="sync.key"
              type="password"
              readonly
              aria-label="Sync key"
              class="h-8 min-w-0 flex-1 rounded-lg border border-border bg-input px-2.5 text-[13px] text-fg outline-0 focus:border-mfg focus:shadow-[0_0_0_3px_var(--ring)]"
            />
            <button
              type="button"
              class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
              @click="copyKey"
            >
              Copy
            </button>
            <button
              type="button"
              class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
              @click="forgetKey"
            >
              Forget
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-2 py-2">
            <button
              type="button"
              class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
              :disabled="!!busy"
              @click="upload"
            >
              Upload
            </button>
            <button
              type="button"
              class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
              :disabled="!!busy"
              @click="download"
            >
              Download
            </button>
            <span v-if="sync.last" class="text-[12.5px] text-mfg">
              {{ sync.last.dir === 'up' ? 'Uploaded' : 'Downloaded from ' + sync.last.from }}
              {{ ago(sync.last.at) }}
            </span>
          </div>
        </template>
        <div class="flex flex-wrap gap-2 py-2">
          <button
            type="button"
            class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
            :disabled="!!busy"
            @click="startFile('export')"
          >
            Export file…
          </button>
          <button
            type="button"
            class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
            :disabled="!!busy"
            @click="startFile('import')"
          >
            Import file…
          </button>
        </div>
        <form
          v-if="fileMode"
          class="flex gap-2 py-2"
          @submit.prevent="fileMode === 'export' ? exportFile() : picker?.click()"
        >
          <input
            v-model="password"
            type="password"
            autofocus
            :placeholder="fileMode === 'export' ? 'New password for the file' : 'File password'"
            class="h-8 min-w-0 flex-1 rounded-lg border border-border bg-input px-2.5 text-[13px] text-fg outline-0 focus:border-mfg focus:shadow-[0_0_0_3px_var(--ring)]"
          />
          <button
            type="submit"
            class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
            :disabled="!password || !!busy"
          >
            {{ fileMode === 'export' ? 'Export' : 'Choose file' }}
          </button>
          <input ref="picker" type="file" accept=".dovetab" hidden @change="onFile" />
        </form>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 py-2.5 text-left"
          @click="sync.icons = !sync.icons"
        >
          <div class="min-w-0">
            <div class="text-[13.5px] font-medium">Include icons</div>
            <div class="mt-0.5 text-[12.5px] text-pretty text-mfg">Adds up to 512 small site icons, about 200 KB.</div>
          </div>
          <Switch v-model="sync.icons" />
        </button>
        <p v-if="busy" role="status" class="py-1 text-[12.5px] text-mfg">{{ busy }}</p>
        <div v-if="incoming" class="my-2 rounded-lg border border-border p-3">
          <div class="text-[13.5px] font-medium">From {{ incoming.from }} · {{ ago(incoming.ts) }}</div>
          <div class="mt-0.5 text-[12.5px] text-mfg">{{ preview }}</div>
          <div class="mt-2.5 flex gap-2">
            <button
              type="button"
              class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
              :disabled="!!busy"
              @click="apply"
            >
              Apply
            </button>
            <button
              type="button"
              class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent disabled:opacity-50"
              @click="incoming = null"
            >
              Cancel
            </button>
          </div>
          <p class="mt-2 text-[12px] text-pretty text-mfg">
            Bookmarks here will match the incoming ones. You can undo right after.
          </p>
        </div>

        <div class="mt-2 border-t border-border pt-[18px] pb-1.5 text-[11.5px] font-medium tracking-[.02em] text-mfg">
          DATA
        </div>
        <div class="flex flex-wrap gap-2 py-2">
          <button
            type="button"
            class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent"
            @click="resetStats"
          >
            Clear usage stats
          </button>
          <button
            type="button"
            class="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] hover:bg-accent"
            @click="clearIcons"
          >
            Clear icon cache
          </button>
        </div>
        <p class="text-[12.5px] text-pretty text-mfg">
          Dovetab has no servers and no analytics. Settings sync with your browser account; stats and icons stay on this
          device.
        </p>
      </div>

      <div class="flex items-center justify-between border-t border-border px-[22px] py-3 text-xs text-mfg">
        <span class="font-mono">
          Dovetab {{ version }} · MIT ·
          <a
            href="https://github.com/k2so-dev/dovetab"
            target="_blank"
            rel="noopener"
            class="underline-offset-2 hover:text-fg hover:underline"
            >GitHub</a
          >
        </span>
        <span class="flex items-center gap-1.5">
          Search
          <kbd class="rounded border border-border px-[5px] py-px font-mono text-[11px]">{{ modKey }}K</kbd>
        </span>
      </div>
    </div>
  </Modal>
</template>
