<script setup lang="ts" vapor>
import { computed, defineVaporAsyncComponent, onMounted, onUnmounted } from 'vue'
import { later } from '@/core/platform'
import { parseUrl, pasteBookmark, ui } from '@/core/ui'
import Content from '@/ui/Content.vue'
import ContextMenu from '@/ui/ContextMenu.vue'
import Sidebar from '@/ui/Sidebar.vue'
import Toast from '@/ui/Toast.vue'

const loaders = {
  palette: () => import('@/ui/Palette.vue'),
  edit: () => import('@/ui/EditDialog.vue'),
  confirm: () => import('@/ui/ConfirmDialog.vue'),
  settings: () => import('@/ui/SettingsDialog.vue'),
}
const Palette = defineVaporAsyncComponent(loaders.palette)
const EditDialog = defineVaporAsyncComponent(loaders.edit)
const ConfirmDialog = defineVaporAsyncComponent(loaders.confirm)
const SettingsDialog = defineVaporAsyncComponent(loaders.settings)

const seen = { palette: false, edit: false, confirm: false, settings: false }
const latch = (k: keyof typeof seen, open: boolean) => (seen[k] ||= open)
const need = computed(() => ({
  palette: latch('palette', ui.palette),
  edit: latch('edit', !!ui.edit),
  confirm: latch('confirm', !!ui.confirm),
  settings: latch('settings', ui.settings),
}))
later(() => Object.values(loaders).forEach((l) => void l()))

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
const anyOverlay = () => ui.palette || ui.settings || !!ui.edit || !!ui.confirm

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.menu = null
    ui.palette = !ui.palette
    return
  }
  if (e.key === 'Escape' && ui.menu) {
    ui.menu = null
    return
  }
  if (ui.palette && !typing(e.target) && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault()
    ui.seed += e.key
    return
  }
  if (anyOverlay() || ui.menu || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'ArrowDown' && !(e.target instanceof Element && e.target.closest('a[data-bid], nav'))) {
    const first = document.querySelector<HTMLElement>('main a[data-bid]')
    if (first) {
      e.preventDefault()
      first.focus()
    }
    return
  }
  if (e.key === '/') {
    e.preventDefault()
    ui.palette = true
  } else if (e.key.length === 1 && e.key !== ' ') {
    e.preventDefault()
    ui.seed = e.key
    ui.palette = true
  }
}

function onPaste(e: ClipboardEvent) {
  if (anyOverlay() || ui.menu || typing(e.target)) return
  const url = parseUrl(e.clipboardData?.getData('text/plain') ?? '')
  if (!url) return
  e.preventDefault()
  pasteBookmark(url)
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('paste', onPaste)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('paste', onPaste)
})
</script>

<template>
  <div class="grid h-screen grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
    <Sidebar />
    <Content />
  </div>
  <ContextMenu />
  <Palette v-if="need.palette" />
  <EditDialog v-if="need.edit" />
  <ConfirmDialog v-if="need.confirm" />
  <SettingsDialog v-if="need.settings" />
  <Toast />
</template>
