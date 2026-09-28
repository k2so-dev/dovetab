import { defineConfig } from 'wxt'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Shelf',
    description: 'Your bookmarks on the new tab. Fast, private, open source.',
    permissions: ['bookmarks', 'storage', 'search', ...(browser === 'firefox' ? [] : ['favicon'])],
    optional_permissions: ['history'],
    optional_host_permissions: ['<all_urls>'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'shelf@newtab',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
  vite: () => ({
    plugins: [vue(), tailwindcss()],
  }),
})
