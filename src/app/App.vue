<script setup lang="ts" vapor>
import { onMounted, onUnmounted } from 'vue'
import { ui } from '@/core/ui'
import ConfirmDialog from '@/ui/ConfirmDialog.vue'
import Content from '@/ui/Content.vue'
import ContextMenu from '@/ui/ContextMenu.vue'
import EditDialog from '@/ui/EditDialog.vue'
import Palette from '@/ui/Palette.vue'
import SettingsDialog from '@/ui/SettingsDialog.vue'
import Sidebar from '@/ui/Sidebar.vue'
import Toast from '@/ui/Toast.vue'

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
  if (anyOverlay() || ui.menu || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === '/') {
    e.preventDefault()
    ui.palette = true
  } else if (e.key.length === 1 && e.key !== ' ') {
    e.preventDefault()
    ui.seed = e.key
    ui.palette = true
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="grid h-screen grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
    <Sidebar />
    <Content />
  </div>
  <ContextMenu />
  <Palette />
  <EditDialog />
  <ConfirmDialog />
  <SettingsDialog />
  <Toast />
</template>
