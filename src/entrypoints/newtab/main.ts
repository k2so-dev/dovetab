import { createVaporApp } from 'vue'
import App from '@/app/App.vue'
import { refresh, watchBookmarks } from '@/core/bookmarks'
import { hasAtlas, initIcons } from '@/core/favicon'
import { initSettings, settings } from '@/core/settings'
import { initUsage } from '@/core/usage'
import { sprite } from '@/ui/icons.gen'
import '@/styles/app.css'

document.body.insertAdjacentHTML('afterbegin', sprite)
initSettings()
watchBookmarks()
void refresh()
const icons = initIcons()
initUsage()

const mount = () => void createVaporApp(App).mount('#app')
if (settings.siteIcons || (settings.icons && hasAtlas()))
  void Promise.race([icons, new Promise((r) => setTimeout(r, 150))]).then(mount)
else mount()
