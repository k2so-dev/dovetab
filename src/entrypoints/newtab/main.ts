import { createVaporApp } from 'vue'
import App from '@/app/App.vue'
import { refresh, watchBookmarks } from '@/core/bookmarks'
import { hasAtlas, initIcons } from '@/core/favicon'
import { initSettings, settings } from '@/core/settings'
import { later } from '@/core/platform'
import { fixRealm } from '@/core/realm'
import { initUsage, recentOn } from '@/core/usage'
import { sprite } from '@/ui/icons.gen'
import '@/styles/app.css'

document.body.insertAdjacentHTML('afterbegin', sprite)
initSettings()
watchBookmarks()
void refresh()
const icons = initIcons()
const visits = initUsage()

const mount = () => {
  fixRealm()
  createVaporApp(App).mount('#app')
}
const waits = [
  ...(settings.siteIcons || (settings.icons && hasAtlas()) ? [icons] : []),
  ...(recentOn() ? [visits] : []),
]
if (waits.length) void Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 150))]).then(mount)
else mount()
addEventListener('load', fixRealm)
later(fixRealm)
