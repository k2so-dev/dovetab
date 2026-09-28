import { createVaporApp } from 'vue'
import App from '@/app/App.vue'
import { refresh, watchBookmarks } from '@/core/bookmarks'
import { initIcons } from '@/core/favicon'
import { initSettings } from '@/core/settings'
import { initUsage } from '@/core/usage'
import { sprite } from '@/ui/icons.gen'
import '@/styles/app.css'

document.body.insertAdjacentHTML('afterbegin', sprite)
initSettings()
watchBookmarks()
void refresh()
void initIcons()
initUsage()

createVaporApp(App).mount('#app')
