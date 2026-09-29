# Dovetab

Your browser bookmarks on the new tab page. Fast, private, open source. Chrome and Firefox.

- Bookmarks as tiles, list or dense columns, with a soft glow tinted by each site's icon (icons themselves can be turned off; the glow stays)
- Folder tree sidebar, breadcrumbs, one section per subfolder
- Full or narrow content width
- Recommended: ranks what you open most and most recently, plus newly added bookmarks
- Full management: edit title / URL / folder, move, drag to reorder, pin, hide, delete with undo, new folders
- Cleanup: finds duplicate bookmarks and old ones you never open
- Keyboard: arrow keys move between bookmarks, `Delete` removes, paste a URL anywhere to bookmark it
- Search palette (`⌘K` / `Ctrl+K`, `/`, or just start typing), with optional history and web search
- Manual sync between any browsers (say Chrome → Firefox): a sync key or a password-protected file, end-to-end encrypted
- System, light or dark theme; animations can be turned off
- System fonts, no web fonts, no framework runtime beyond Vue Vapor (~50 KB JS gzipped)

<img width="3200" height="2000" alt="Screenshot dovetab" src="https://github.com/user-attachments/assets/5b7b5253-9e7a-4fd3-8529-bd12f3b6b136" />

## Privacy

Dovetab has no servers, no analytics, no telemetry and makes no network requests of its own, except when you press Upload or Download in Settings → Sync.

The optional "Warm up links on hover" setting (off by default) lets the browser resolve a bookmark's domain when you hover it, so the page starts loading sooner. Your DNS resolver sees these lookups, as it would when you open the link.

| Data                      | Where it lives                                                             |
| ------------------------- | -------------------------------------------------------------------------- |
| Bookmarks                 | Your browser. Dovetab reads and edits them through the `bookmarks` API.    |
| Settings, pins, hidden    | `storage.sync`, synced by your browser account like any extension setting. |
| Open counts (for ranking) | `localStorage` on this device. Clear it in Settings → Data.                |
| Site icons and colors     | IndexedDB / `localStorage` on this device. Clear it in Settings → Data.    |

### Sync

Settings → Sync moves settings, bookmarks and (optionally) up to 512 small site icons to another browser. Nothing happens automatically.

- **Sync key**: create a key in one browser, paste it in the other. Upload encrypts a snapshot with AES-256-GCM on your device and publishes it to four public [Nostr](https://nostr.com) relays as replaceable app-data events (NIP-78). Download fetches the newest one. Relays only see random bytes and a random public key derived from your sync key. Treat the key like a password: anyone who has it can read and replace your sync data.
- **File**: export a `.dovetab` file protected by a password (PBKDF2-SHA256, 600k iterations, AES-256-GCM) and import it anywhere. No network at all.

Download and import show what will change first. Applying makes this browser's bookmarks match the snapshot (only the difference is created, removed or moved, root folders are matched by kind) and can be undone right after. Usage stats, history and per-device state are never synced.

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
git clone https://github.com/k2so-dev/dovetab.git && cd dovetab
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
pnpm build && pnpm zip                    # .output/dovetab-<version>-chrome.zip
pnpm build:firefox && pnpm zip:firefox    # .output/dovetab-<version>-firefox.zip
```

### Try it in Chrome

`chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`.

### Try it in Firefox

Firefox 128 or newer.

- Quickest: `pnpm dev:firefox` opens a fresh Firefox profile with the extension and reloads it on changes.
- In your own profile: `pnpm build:firefox`, then `about:debugging` → This Firefox → Load Temporary Add-on → `.output/firefox-mv3/manifest.json`. Open a new tab and choose "Keep Changes" when Firefox asks about the new tab page. Temporary add-ons are removed when Firefox restarts.
- Keep it installed across restarts: release Firefox only installs signed add-ons, so either sign it as unlisted on AMO, or use Firefox Developer Edition / Nightly, set `xpinstall.signatures.required` to `false` in `about:config`, rename `dovetab-<version>-firefox.zip` to `.xpi` and install it from `about:addons` → gear → Install Add-on From File.

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
