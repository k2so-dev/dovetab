export const loaders = {
  palette: () => import('@/ui/Palette.vue'),
  edit: () => import('@/ui/EditDialog.vue'),
  confirm: () => import('@/ui/ConfirmDialog.vue'),
  settings: () => import('@/ui/SettingsDialog.vue'),
}

export const preload = (k: keyof typeof loaders) => void loaders[k]()
