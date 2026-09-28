# Shelf

Your browser bookmarks on the new tab page. Fast, private, open source. Chrome and Firefox.

- Bookmarks as tiles, list or dense columns, with a soft glow tinted by each site's icon
- Folder tree sidebar, breadcrumbs, one section per subfolder
- Recommended: ranks what you open most and most recently, plus newly added bookmarks
- Full management: edit title / URL / folder, move, drag to reorder, pin, hide, delete with undo, new folders
- Search palette (`⌘K` / `Ctrl+K`, `/`, or just start typing), with optional history and web search
- System, light or dark theme; animations can be turned off
- System fonts, no web fonts, no framework runtime beyond Vue Vapor (~46 KB JS gzipped)

## Privacy

Shelf has no servers, no analytics, no telemetry and makes no network requests of its own.

| Data                      | Where it lives                                                             |
| ------------------------- | -------------------------------------------------------------------------- |
| Bookmarks                 | Your browser. Shelf reads and edits them through the `bookmarks` API.      |
| Settings, pins, hidden    | `storage.sync`, synced by your browser account like any extension setting. |
| Open counts (for ranking) | `localStorage` on this device. Clear it in Settings → Data.                |
| Site icons and colors     | IndexedDB / `localStorage` on this device. Clear it in Settings → Data.    |

### Permissions

| Permission              | Why                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bookmarks`             | Show and edit bookmarks.                                                                                                                          |
| `storage`               | Save settings.                                                                                                                                    |
| `search`                | "Search the web for …" uses your default search engine.                                                                                           |
| `favicon` (Chrome only) | Read site icons from the browser's own icon cache, without any network request.                                                                   |
| `history` (optional)    | Only if you turn on "Use browsing history". Returned to the browser when you turn it off.                                                         |
| All sites (optional)    | Only if you turn on "Fetch icons from sites": downloads a sharper icon from the bookmarked site itself. Never through a third-party icon service. |

## Develop

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm dev            # Chrome with hot reload
pnpm dev:firefox    # Firefox
pnpm test           # unit tests (Vitest)
pnpm e2e            # build + end-to-end flows in Chromium (Playwright)
pnpm shots          # build + screenshots into tests/e2e/.shots
pnpm typecheck
```

Build and package:

```sh
pnpm build && pnpm zip                    # .output/shelf-<version>-chrome.zip
pnpm build:firefox && pnpm zip:firefox    # .output/shelf-<version>-firefox.zip
```

Load unpacked: Chrome → `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`.
Firefox → `about:debugging` → This Firefox → Load Temporary Add-on → `.output/firefox-mv3/manifest.json`.

### Stack

[WXT](https://wxt.dev) · Vue 3.6 [Vapor mode](https://vuejs.org) (no virtual DOM) · Tailwind CSS 4 · [Lucide](https://lucide.dev) icons as an inline sprite (`pnpm icons` after editing `scripts/build-icons.ts`).

```
src/core/   state and logic (bookmarks, settings, ranking, sorting, search, favicons)
src/ui/     Vapor components
src/styles/ design tokens and Tailwind setup
public/boot.js   applies theme before first paint
```

## License

MIT
