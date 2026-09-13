# Desktop-Only Enforcer for Obsidian

An Obsidian plugin that ensures designated plugins remain **desktop-only** across updates, preventing unwanted execution, slowdowns, and crashes on mobile devices (Android / iOS).

---

## 🎯 The Problem

When using Obsidian across desktop and mobile (synced via Obsidian Sync, Git, Syncthing, iCloud, etc.), running resource-heavy desktop plugins (like *Omnisearch*, *Smart Connections*, *Obsidian Git*, *Commander*, *Smart Lookup*) on mobile can cause severe battery drain, high memory usage, and app crashes.

Obsidian has a built-in flag in plugin manifests:
```json
"isDesktopOnly": true
```
When this flag is set to `true`, Obsidian Mobile ignores the plugin and never attempts to load it.

**The issue:** Whenever you update a plugin on desktop, Obsidian re-downloads the official `manifest.json` from the author's GitHub repository. Upstream manifests almost always have `"isDesktopOnly": false` (or omit the property). This overwrites your local setting and causes mobile sync to break. Furthermore, manual editing often introduces duplicate keys into `manifest.json`.

---

## 🚀 The Solution: Desktop-Only Enforcer

**Desktop-Only Enforcer** solves this permanently:

1. **Persistent Rule List**: Choose which plugins should always be desktop-only directly from Obsidian Settings.
2. **Real-Time Watcher**: Detects the moment an update is installed and immediately restores `"isDesktopOnly": true` before the changed manifest is synced to mobile.
3. **Startup & Periodic Scans**: Automatically validates all manifests on Obsidian startup and at customizable intervals.
4. **JSON Sanitization**: Cleans up duplicate `isDesktopOnly` keys and ensures well-formatted JSON.
5. **Runtime Synchronization**: Updates Obsidian's internal in-memory manifest cache so you don't even need to restart Obsidian.

---

## ✨ Features

- **Intuitive Management UI**:
  - Searchable list of all installed community plugins.
  - Status badges: `Desktop Only (Protected)`, `Desktop Only (Unprotected)`, and `Universal (Desktop + Mobile)`.
  - Filter pills: `All`, `Enforced`, `Not Enforced`.
  - Single-click toggle switches to enforce or un-enforce any plugin.
- **One-Click Manual Enforcement**: "Check & enforce now" button in Settings and via the Obsidian Command Palette (`Ctrl/Cmd + P`).
- **Configurable Automation**:
  - Real-time file system monitoring with debounce.
  - Periodic background checks (e.g. every 5, 15, 30, or 60 minutes).
  - Optional desktop notifications when a manifest is corrected.
- **Lightweight & Desktop-Only**: Runs exclusively on desktop and leaves zero footprint on mobile.

---

## 📦 Installation

Since this plugin is built locally:

1. In your vault's plugins folder (`<Vault>/.obsidian/plugins/`), create a new directory named:
   ```bash
   desktop-only-enforcer
   ```
2. Copy the following three files from this repository into that folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. In Obsidian, go to **Settings** -> **Community Plugins**.
4. Click **Reload plugins**, then toggle **Desktop-Only Enforcer** to ON.
5. Open the plugin's settings tab to choose which plugins you want to keep desktop-only!

---

## 🛠️ Development & Building

Requirements: Node.js 18+ and npm.

```bash
# Install dependencies
npm install

# Build production bundle (generates main.js)
npm run build

# Start development build with auto-rebuild on file changes
npm run dev

# Run automated unit test suite
npm test
```

### Test Suite

The test suite tests:
- Clean manifest deduplication and JSON formatting.
- Correcting manifests that revert to `isDesktopOnly: false`.
- Respecting non-enforced plugins.
- Batch scanning and enforcement.
- Real-time `PluginsWatcher` event handling and debounce.

---

## 📄 License

MIT License.
