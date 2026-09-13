# Desktop-Only Enforcer for Obsidian

A lightweight, automated desktop plugin for Obsidian that locks the `"isDesktopOnly": true` flag in designated community plugins. It prevents updates from resetting your plugins to multiplatform mode, ensuring mobile devices (Android / iOS) never attempt to run heavy, incompatible desktop extensions.

---

## 📖 Table of Contents

- [The Problem](#-the-problem)
  - [Why Plugins Break on Mobile](#why-plugins-break-on-mobile)
  - [Why Manual Edits Fail](#why-manual-edits-fail)
- [How Desktop-Only Enforcer Works](#-how-desktop-only-enforcer-works)
  - [Lifecycle Comparison](#lifecycle-comparison)
  - [Core Protection Mechanisms](#core-protection-mechanisms)
- [Status Badges Explained](#-status-badges-explained)
- [Settings & Configuration](#%EF%B8%8F-settings--configuration)
  - [Automation Options](#automation-options)
  - [Plugin Manager List](#plugin-manager-list)
- [Command Palette Actions](#-command-palette-actions)
- [Step-by-Step Installation](#-step-by-step-installation)
  - [Manual Installation](#manual-installation)
  - [Sync Recommendations](#sync-recommendations)
- [Architecture & Technical Details](#-architecture--technical-details)
  - [Deduplication & Sanitization](#deduplication--sanitization)
  - [Self-Write Loop Prevention](#self-write-loop-prevention)
  - [In-Memory Cache Sync](#in-memory-cache-sync)
- [Development & Testing](#-development--testing)
- [License](#-license)

---

## 🎯 The Problem

### Why Plugins Break on Mobile

Obsidian's cross-platform synchronization (via Obsidian Sync, Git, Syncthing, Remotely Save, iCloud, etc.) copies the `.obsidian/plugins/` directory between your desktop and mobile devices.

However, many popular desktop plugins are **not designed for mobile devices**:
- **Semantic search & local AI models** (e.g. *Smart Connections*, *Smart Lookup*, *Omnisearch*) index large vector databases, consuming hundreds of megabytes of RAM and draining the mobile battery.
- **Git integration** (*Obsidian Git*) relies on native Git binaries or WebAssembly structures that can crash mobile environments.
- **Heavy UI extensions** (*Commander*, *Dragger*, *Strange New Worlds*) often rely on mouse events, desktop toolbars, or desktop CSS that break mobile responsive layouts.

Obsidian has a built-in manifest flag:
```json
"isDesktopOnly": true
```
When this flag is set to `true` inside a plugin's `manifest.json`, **Obsidian Mobile completely ignores the plugin and will never load or execute it**.

### Why Manual Edits Fail

If you manually edit `.obsidian/plugins/<plugin-id>/manifest.json` on your PC:
1. **Updates overwrite your changes**: Whenever you click "Update" in Obsidian or auto-update triggers, Obsidian re-downloads the official `manifest.json` from the author's GitHub repository. Upstream community plugins almost always set `"isDesktopOnly": false` (or omit it entirely). Your manual edit is wiped out instantly.
2. **Accidental duplicate keys**: When users try to append `"isDesktopOnly": true` via scripts or quick text edits, manifests often end up with malformed duplicate JSON keys:
   ```json
   {
     "id": "smart-lookup",
     "name": "Smart Lookup",
     "isDesktopOnly": false,
     "version": "0.3.4",
     "isDesktopOnly": true
   }
   ```
   Depending on the JSON parser, duplicate keys can produce unpredictable behavior, be ignored, or break parsing altogether.

---

## 🚀 How Desktop-Only Enforcer Works

### Lifecycle Comparison

```
❌ WITHOUT DESKTOP-ONLY ENFORCER:
Desktop: Click "Update" ──> Manifest overwritten with isDesktopOnly: false
                                  │
                                  ▼
Sync: Manifest synced to Mobile (Obsidian Sync / Git / Syncthing)
                                  │
                                  ▼
Mobile: Obsidian loads heavy desktop plugin ──> High RAM, sluggishness, crash!
```

```
✅ WITH DESKTOP-ONLY ENFORCER:
Desktop: Click "Update" ──> Manifest overwritten by update
                                  │
                                  ▼
Desktop-Only Enforcer: Watcher intercepts change within milliseconds!
                       Re-writes manifest with clean "isDesktopOnly": true
                                  │
                                  ▼
Sync: Clean manifest (isDesktopOnly: true) is synced to Mobile
                                  │
                                  ▼
Mobile: Obsidian Mobile ignores the plugin ──> Fast, stable, battery preserved!
```

### Core Protection Mechanisms

1. **Real-Time File Watcher (Node.js `fs.watch`)**: Watches the `.obsidian/plugins/` directory. The instant Obsidian finishes writing an updated plugin, the watcher triggers, inspects the manifest, and restores `isDesktopOnly: true` before sync clients pick it up.
2. **Startup Auto-Scan (`onload`)**: Scans all installed plugins whenever Obsidian starts up on your desktop and immediately corrects any out-of-sync manifests.
3. **Configurable Periodic Fallback**: Runs a background check at customizable intervals (e.g. every 15 minutes) as a safety net.
4. **Instant Manual Enforcement**: Accessible via a one-click button in Settings or through the Obsidian Command Palette.

---

## 🏷️ Status Badges Explained

In the plugin's settings tab, every installed plugin displays a status badge:

| Badge | Meaning | What you should do |
|---|---|---|
| 🟢 **`Desktop Only (Protected)`** | The plugin has `isDesktopOnly: true` on disk **AND** is guarded by this plugin. | Nothing! It is fully protected and will survive updates. |
| 🟡 **`Desktop Only (Unprotected)`** | The plugin currently has `isDesktopOnly: true` on disk (e.g. from an old manual edit or author default), but is **NOT guarded** by this plugin. | **Toggle the switch ON** if you want to guarantee it stays desktop-only after future updates. |
| ⚪ **`Universal (Desktop + Mobile)`** | The plugin is configured as multiplatform (`isDesktopOnly: false` or omitted). | Toggle ON if you want to restrict it to desktop only, or leave OFF to run everywhere. |
| 🟠 **`Duplicate keys cleaned`** | Malformed JSON with multiple `isDesktopOnly` declarations was detected and automatically resolved. | Informational; the file is now clean and valid JSON. |

---

## ⚙️ Settings & Configuration

Open Obsidian **Settings** ➔ **Desktop-Only Enforcer**:

### Automation Options

- **Enforce all now**: Runs an on-demand scan of all plugins and reports how many manifests were verified or restored.
- **Real-time file watcher**: Enables/disables live background file system monitoring. When enabled, catches updates immediately.
- **Periodic check interval**: Sets how often the fallback scan runs (Options: *Disabled*, *5 min*, *15 min*, *30 min*, *60 min*).
- **Notify on correction**: Shows an Obsidian Notice toast (e.g., *"Restored desktop-only status for 2 plugin(s): Omnisearch, Smart Lookup"*) whenever an overwritten manifest is corrected.
- **Verbose console logging**: Logs detailed actions into the Obsidian Developer Console (`Ctrl + Shift + I` / `Cmd + Option + I`).

### Plugin Manager List

- **Search filter**: Real-time search box to quickly filter plugins by name or folder ID.
- **Filter pills**: Filter by `All`, `Enforced` (protected), or `Not Enforced`.
- **Toggle switch**: Instantly switches a plugin between protected desktop-only mode and universal mode.

---

## ⌨️ Command Palette Actions

Open the Obsidian Command Palette (`Ctrl + P` or `Cmd + P`) and search for:

1. **`Desktop-Only Enforcer: Check and enforce desktop-only plugins now`**
   Forces an immediate verification scan and displays a notification summary.
2. **`Desktop-Only Enforcer: Show summary of desktop-only status in console`**
   Prints an interactive tabular breakdown (`console.table`) of all installed plugins, their disk status, protection status, and duplicate key warnings in the Developer Tools console.

---

## 📦 Step-by-Step Installation

### Manual Installation

Because this plugin is tailored specifically for your setup, install it directly into your vault:

1. Open your terminal and navigate to your vault's plugins directory:
   ```bash
   cd ~/Documents/ObsidianVaults/<YourVault>/.obsidian/plugins/
   ```
2. Create the plugin folder:
   ```bash
   mkdir -p desktop-only-enforcer
   ```
3. Copy the compiled files from this repository:
   ```bash
   cp /home/jeff/Documents/work/obsidian-desktopOnly/{main.js,manifest.json,styles.css} desktop-only-enforcer/
   ```
4. In Obsidian:
   - Go to **Settings** ➔ **Community Plugins**.
   - Click the **Reload** button (refresh icon next to "Installed plugins").
   - Enable **Desktop-Only Enforcer**.
   - Open **Desktop-Only Enforcer** settings to configure your protected plugins!

### Sync Recommendations

- **Desktop-Only Enforcer itself is marked `isDesktopOnly: true`**: It runs strictly on desktop and uses Node.js system APIs. Mobile Obsidian will ignore it and not run it, keeping mobile clean.
- **Syncing `.obsidian/plugins/`**: When using Obsidian Sync, Git, or Syncthing, changes made by Desktop-Only Enforcer are committed/synced normally. Because the manifests have `isDesktopOnly: true`, mobile devices will know not to start those plugins.

---

## 🧠 Architecture & Technical Details

### Deduplication & Sanitization
When saving manifests, Desktop-Only Enforcer:
1. Reads the raw string and regex-checks for multiple occurrences of `"isDesktopOnly"`.
2. Parses the content safely with `JSON.parse`.
3. Sets `manifest.isDesktopOnly = true` (or `false` if un-enforced).
4. Serializes with standard 2-space indentation: `JSON.stringify(manifest, null, 2) + "\n"`.
5. Writes atomically via Obsidian's `vault.adapter` or Node file system.

### Self-Write Loop Prevention
When the plugin modifies a `manifest.json` on disk, the file watcher picks up the file event. To prevent an infinite feedback loop, the `EnforcerService` records timestamps of its own writes (`markWritten(pathOrId)`). Any file event occurring within the debounce window of a known write is safely ignored.

### In-Memory Cache Sync
Obsidian keeps an internal dictionary of loaded manifests in `app.plugins.manifests[id]`. Whenever Desktop-Only Enforcer fixes a file on disk, it also updates the in-memory object:
```typescript
if ((this.app as any).plugins?.manifests?.[pluginId]) {
    (this.app as any).plugins.manifests[pluginId].isDesktopOnly = true;
}
```
This guarantees that Obsidian's running session is immediately in sync with the file system without requiring an app reload.

---

## 🛠️ Development & Testing

Built with TypeScript and bundled via `esbuild`.

### Setup & Commands

```bash
# Install dependencies
npm install

# Build production bundle (generates main.js)
npm run build

# Start live development watch mode
npm run dev

# Run full automated unit test suite
npm test
```

### Test Suite Overview ([`tests/enforcer.test.mjs`](tests/enforcer.test.mjs))

The test suite runs with Node's native test runner (`node:test`) and mocks the Obsidian runtime to verify:
- Parsing and eliminating duplicate keys from malformed manifests.
- Detecting upstream updates where `isDesktopOnly` reverted to `false` and enforcing `true`.
- Leaving non-enforced plugins untouched.
- Batch enforcement across multiple installed plugins.
- Real-time `PluginsWatcher` event capture, debouncing, and automated disk restoration.

---

## 📄 License

MIT License. Feel free to use and adapt as needed.
