<script setup lang="ts" vapor>
import { computed } from 'vue'
import { model } from '@/core/bookmarks'
import { clearIconCache, colorFor } from '@/core/favicon'
import { browser, dropPermission, modKey, requestPermission, type Perm } from '@/core/platform'
import { animationsOn, settings, toggleIn } from '@/core/settings'
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
  await clearIconCache()
  toast('Icon cache cleared')
}
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
            :style="{ background: colorFor(h.host) }"
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
