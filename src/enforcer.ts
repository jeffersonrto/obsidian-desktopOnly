import { App, FileSystemAdapter, Notice } from "obsidian";
import { DesktopOnlySettings, EnforceResult, PluginManifestInfo } from "./types";

export class EnforcerService {
	private app: App;
	private getSettings: () => DesktopOnlySettings;
	private saveSettings: () => Promise<void>;
	
	// Track recently written manifests with timestamps to prevent watcher loops
	private recentWrites: Map<string, number> = new Map();

	constructor(
		app: App,
		getSettings: () => DesktopOnlySettings,
		saveSettings: () => Promise<void>
	) {
		this.app = app;
		this.getSettings = getSettings;
		this.saveSettings = saveSettings;
	}

	/**
	 * Get the relative path to the plugins directory within the vault adapter.
	 */
	public getPluginsFolderPath(): string {
		const configDir = this.app.vault.configDir || ".obsidian";
		return `${configDir}/plugins`;
	}

	/**
	 * Get the absolute path to the plugins directory (Desktop only).
	 */
	public getPluginsFolderAbsolutePath(): string | null {
		const adapter = this.app.vault.adapter as any;
		if (adapter instanceof FileSystemAdapter || (adapter && typeof adapter.getBasePath === "function")) {
			const basePath = adapter.getBasePath();
			const configDir = this.app.vault.configDir || ".obsidian";
			return `${basePath}/${configDir}/plugins`;
		}
		return null;
	}

	/**
	 * Clear recent writes tracking (useful for testing or state resets).
	 */
	public clearRecentWrites(): void {
		this.recentWrites.clear();
	}

	/**
	 * Check if a path was recently written by this service within the last N ms.
	 */
	public isRecentWrite(pathOrId: string, windowMs: number = 2000): boolean {
		const lastWritten = this.recentWrites.get(pathOrId);
		if (!lastWritten) return false;
		return Date.now() - lastWritten < windowMs;
	}


	public markWritten(pathOrId: string): void {
		this.recentWrites.set(pathOrId, Date.now());
		// Clean up old entries
		if (this.recentWrites.size > 100) {
			const now = Date.now();
			for (const [key, timestamp] of this.recentWrites.entries()) {
				if (now - timestamp > 10000) {
					this.recentWrites.delete(key);
				}
			}
		}
	}

	/**
	 * Scans all installed plugins and retrieves their current manifest information from disk.
	 */
	public async scanAllPlugins(): Promise<PluginManifestInfo[]> {
		const pluginsFolder = this.getPluginsFolderPath();
		const adapter = this.app.vault.adapter;

		if (!(await adapter.exists(pluginsFolder))) {
			return [];
		}

		const list = await adapter.list(pluginsFolder);
		const results: PluginManifestInfo[] = [];

		for (const folderPath of list.folders) {
			const folderParts = folderPath.split("/").filter(Boolean);
			const pluginId = folderParts[folderParts.length - 1];
			if (!pluginId) continue;

			// Don't enforce our own plugin
			if (pluginId === "desktop-only-enforcer") continue;

			const manifestRelPath = `${folderPath}/manifest.json`;
			if (!(await adapter.exists(manifestRelPath))) continue;

			try {
				const rawContent = await adapter.read(manifestRelPath);
				const duplicateMatches = rawContent.match(/"isDesktopOnly"\s*:/g);
				const hasDuplicateKeys = duplicateMatches ? duplicateMatches.length > 1 : false;

				const parsed = JSON.parse(rawContent);
				const isDesktopOnly = Boolean(parsed.isDesktopOnly);

				// Fallback to in-memory plugin info if available for better display name
				const inMemoryManifest = (this.app as any).plugins?.manifests?.[pluginId];

				results.push({
					id: pluginId,
					name: parsed.name || inMemoryManifest?.name || pluginId,
					version: parsed.version || inMemoryManifest?.version,
					author: parsed.author || inMemoryManifest?.author,
					description: parsed.description || inMemoryManifest?.description,
					isDesktopOnly,
					hasDuplicateKeys,
					manifestRelativePath: manifestRelPath,
					manifestAbsolutePath: this.getPluginsFolderAbsolutePath()
						? `${this.getPluginsFolderAbsolutePath()}/${pluginId}/manifest.json`
						: manifestRelPath,
				});
			} catch (err) {
				console.error(`[Desktop-Only Enforcer] Failed reading manifest for ${pluginId}:`, err);
			}
		}

		// Sort alphabetically by name
		return results.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Enforce desktop-only policy for a specific plugin.
	 */
	public async enforcePlugin(pluginId: string): Promise<EnforceResult | null> {
		const settings = this.getSettings();
		const shouldBeDesktopOnly = settings.enforcedPluginIds.includes(pluginId);

		const pluginsFolder = this.getPluginsFolderPath();
		const manifestRelPath = `${pluginsFolder}/${pluginId}/manifest.json`;
		const adapter = this.app.vault.adapter;

		if (!(await adapter.exists(manifestRelPath))) {
			return null;
		}

		try {
			const rawContent = await adapter.read(manifestRelPath);
			const duplicateMatches = rawContent.match(/"isDesktopOnly"\s*:/g);
			const hadDuplicateKeys = duplicateMatches ? duplicateMatches.length > 1 : false;

			const manifest = JSON.parse(rawContent);
			const previousIsDesktopOnly = Boolean(manifest.isDesktopOnly);
			const pluginName = manifest.name || pluginId;

			// If it's configured to be enforced, ensure isDesktopOnly is true and deduplicate keys
			if (shouldBeDesktopOnly) {
				if (!previousIsDesktopOnly || hadDuplicateKeys) {
					manifest.isDesktopOnly = true;
					const formatted = JSON.stringify(manifest, null, 2) + "\n";
					
					this.markWritten(manifestRelPath);
					this.markWritten(pluginId);
					await adapter.write(manifestRelPath, formatted);

					// Synchronize in-memory manifest cache
					this.syncInMemoryManifest(pluginId, true);

					if (settings.verboseLogging) {
						console.log(`[Desktop-Only Enforcer] Fixed manifest for '${pluginName}' (${pluginId}) -> isDesktopOnly: true`);
					}

					return {
						pluginId,
						pluginName,
						fixed: true,
						previousIsDesktopOnly,
						hadDuplicateKeys,
					};
				}
			}

			return {
				pluginId,
				pluginName,
				fixed: false,
				previousIsDesktopOnly,
				hadDuplicateKeys,
			};
		} catch (err: any) {
			console.error(`[Desktop-Only Enforcer] Error enforcing manifest for ${pluginId}:`, err);
			return {
				pluginId,
				pluginName: pluginId,
				fixed: false,
				previousIsDesktopOnly: false,
				hadDuplicateKeys: false,
				error: err?.message || String(err),
			};
		}
	}

	/**
	 * Manually change the desktop-only flag for a plugin and update settings accordingly.
	 */
	public async setPluginDesktopOnly(pluginId: string, enforce: boolean): Promise<boolean> {
		const settings = this.getSettings();
		const currentSet = new Set(settings.enforcedPluginIds);

		if (enforce) {
			currentSet.add(pluginId);
		} else {
			currentSet.delete(pluginId);
		}

		settings.enforcedPluginIds = Array.from(currentSet);
		await this.saveSettings();

		const pluginsFolder = this.getPluginsFolderPath();
		const manifestRelPath = `${pluginsFolder}/${pluginId}/manifest.json`;
		const adapter = this.app.vault.adapter;

		if (await adapter.exists(manifestRelPath)) {
			try {
				const rawContent = await adapter.read(manifestRelPath);
				const manifest = JSON.parse(rawContent);

				manifest.isDesktopOnly = enforce;
				const formatted = JSON.stringify(manifest, null, 2) + "\n";

				this.markWritten(manifestRelPath);
				this.markWritten(pluginId);
				await adapter.write(manifestRelPath, formatted);
				this.syncInMemoryManifest(pluginId, enforce);

				return true;
			} catch (err) {
				console.error(`[Desktop-Only Enforcer] Failed setting desktop-only for ${pluginId}:`, err);
				return false;
			}
		}

		return true;
	}

	/**
	 * Check all enforced plugins and fix any that have changed or reverted.
	 */
	public async checkAndEnforceAll(showNotice: boolean = false): Promise<EnforceResult[]> {
		const settings = this.getSettings();
		const enforcedList = settings.enforcedPluginIds;
		const results: EnforceResult[] = [];

		if (!enforcedList || enforcedList.length === 0) {
			if (showNotice) {
				new Notice("Desktop-Only Enforcer: No plugins are marked for enforcement.");
			}
			return [];
		}

		for (const pluginId of enforcedList) {
			const res = await this.enforcePlugin(pluginId);
			if (res) {
				results.push(res);
			}
		}

		const fixedResults = results.filter((r) => r.fixed);

		if (fixedResults.length > 0) {
			const fixedNames = fixedResults.map((r) => r.pluginName).join(", ");
			if (settings.notifyOnCorrection || showNotice) {
				new Notice(
					`Desktop-Only Enforcer: Restored desktop-only status for ${fixedResults.length} plugin(s): ${fixedNames}`,
					6000
				);
			}
		} else if (showNotice) {
			new Notice(`Desktop-Only Enforcer: All ${enforcedList.length} enforced plugin(s) are up to date.`);
		}

		return results;
	}

	/**
	 * Synchronize Obsidian's in-memory manifest cache so runtime matches disk.
	 */
	private syncInMemoryManifest(pluginId: string, isDesktopOnly: boolean): void {
		try {
			const inMemory = (this.app as any).plugins?.manifests?.[pluginId];
			if (inMemory) {
				inMemory.isDesktopOnly = isDesktopOnly;
			}
		} catch {
			// In-memory access is non-critical
		}
	}
}
