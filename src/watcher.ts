import * as fs from "fs";
import { EnforcerService } from "./enforcer";
import { DesktopOnlySettings } from "./types";

export class PluginsWatcher {
	private enforcer: EnforcerService;
	private getSettings: () => DesktopOnlySettings;
	private fsWatchers: fs.FSWatcher[] = [];
	private debounceTimer: NodeJS.Timeout | null = null;
	private isRunning: boolean = false;

	constructor(enforcer: EnforcerService, getSettings: () => DesktopOnlySettings) {
		this.enforcer = enforcer;
		this.getSettings = getSettings;
	}

	/**
	 * Starts watching the plugins directory for manifest updates.
	 */
	public start(): void {
		if (this.isRunning) return;

		const pluginsPath = this.enforcer.getPluginsFolderAbsolutePath();
		if (!pluginsPath || !fs.existsSync(pluginsPath)) {
			return;
		}

		this.isRunning = true;

		try {
			// Try recursive watch first (supported in modern Node.js on Linux, macOS, and Windows)
			const watcher = fs.watch(
				pluginsPath,
				{ recursive: true },
				(eventType, filename) => {
					this.handleFileEvent(filename);
				}
			);

			watcher.on("error", (err) => {
				console.warn("[Desktop-Only Enforcer] Recursive watch error, switching to directory watch:", err);
				this.stop();
				this.startPerFolderWatch(pluginsPath);
			});

			this.fsWatchers.push(watcher);
		} catch (e) {
			// If recursive watch is not supported by the platform/kernel, watch subdirectories
			this.startPerFolderWatch(pluginsPath);
		}
	}

	/**
	 * Fallback: Watch each installed plugin's directory individually.
	 */
	private startPerFolderWatch(pluginsPath: string): void {
		try {
			const entries = fs.readdirSync(pluginsPath, { withFileTypes: true });

			// Watch the main plugins folder for added/removed plugins
			const rootWatcher = fs.watch(pluginsPath, () => {
				this.handleFileEvent("manifest.json");
			});
			this.fsWatchers.push(rootWatcher);

			// Watch each plugin subfolder
			for (const entry of entries) {
				if (entry.isDirectory()) {
					const subPath = `${pluginsPath}/${entry.name}`;
					try {
						const subWatcher = fs.watch(subPath, (eventType, filename) => {
							if (!filename || filename === "manifest.json") {
								this.handleFileEvent(`${entry.name}/manifest.json`);
							}
						});
						this.fsWatchers.push(subWatcher);
					} catch (subErr) {
						// Ignore individual folder watch errors
					}
				}
			}
		} catch (err) {
			console.error("[Desktop-Only Enforcer] Failed to start folder watchers:", err);
		}
	}

	/**
	 * Handle file system event with debounce to prevent spamming during multi-step updates.
	 */
	private handleFileEvent(filename: string | null): void {
		if (!this.isRunning) return;

		// If a specific filename is reported and it does not relate to manifest.json, skip
		if (filename && !filename.endsWith("manifest.json")) {
			return;
		}

		let affectedPluginId: string | null = null;
		if (filename) {
			const parts = filename.replace(/\\/g, "/").split("/");
			if (parts.length > 1) {
				affectedPluginId = parts[0];
			}
		}

		// If the change was triggered by our own write, skip
		if (affectedPluginId && this.enforcer.isRecentWrite(affectedPluginId)) {
			return;
		}

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(async () => {
			const settings = this.getSettings();
			if (!settings.enableWatcher) return;

			if (affectedPluginId && settings.enforcedPluginIds.includes(affectedPluginId)) {
				// Fast path: target only the affected plugin
				await this.enforcer.enforcePlugin(affectedPluginId);
			} else {
				// Re-check all enforced plugins
				await this.enforcer.checkAndEnforceAll(false);
			}
		}, 600);
	}

	/**
	 * Stops all active watchers.
	 */
	public stop(): void {
		this.isRunning = false;
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		for (const watcher of this.fsWatchers) {
			try {
				watcher.close();
			} catch {
				// Ignore close errors
			}
		}
		this.fsWatchers = [];
	}

	public restart(): void {
		this.stop();
		if (this.getSettings().enableWatcher) {
			this.start();
		}
	}
}
