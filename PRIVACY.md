# Privacy Policy

Dovetab does not collect, sell or share any personal data. It has no servers, no accounts, no analytics and no telemetry.

## Data stored on your device

- **Bookmarks** stay in your browser. Dovetab reads and edits them through the browser's `bookmarks` API.
- **Settings, pins and hidden items** are saved in `storage.sync`. If you use browser sync, your browser syncs them with your account like any other extension setting.
- **Open counts, cached icons and colors** are kept in `localStorage` and IndexedDB on this device. You can clear them in Settings → Data.

## Network requests

Dovetab makes no network requests of its own, with these user-controlled exceptions:

- **Fetch icons from sites** (optional, off by default): downloads favicons directly from the sites in your bookmarks. No third-party icon service is used.
- **Warm up links on hover** (optional, off by default): lets the browser resolve a bookmark's domain name when you hover it. Your DNS resolver sees these lookups, as it would when you open the link.
- **Sync** (manual only): when you press Upload, a snapshot of your settings and bookmarks (and optionally site icons) is compressed and encrypted on your device with AES-256-GCM, then published to public [Nostr](https://nostr.com) relays (`relay.damus.io`, `nos.lol`, `relay.primal.net`, `nostr.mom`). Relays only receive encrypted data and a public key derived from your sync key. Only someone with your sync key can read it. Download reads it back. Nothing is sent unless you press these buttons.
- **Export file** creates a password-encrypted file on your device and uses no network.

Usage stats and browsing history are never synced or sent anywhere.

## Optional permissions

- **History** is used only to rank recommendations and show recently visited pages, on this device. The permission is requested when you turn the setting on and removed when you turn it off.
- **Access to all sites** is used only to fetch icons. The permission is requested when you turn the setting on and removed when you turn it off.

## Contact

Questions and issues: https://github.com/k2so-dev/dovetab/issues
