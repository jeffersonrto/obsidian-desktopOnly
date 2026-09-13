export interface DesktopOnlySettings {
	/**
	 * List of plugin IDs that must always have `isDesktopOnly: true` in their manifest.json
	 */
	enforcedPluginIds: string[];

	/**
	 * Automatically watch plugin manifests for changes and re-enforce isDesktopOnly in real time.
	 */
	enableWatcher: boolean;

	/**
	 * Periodic backup check interval in minutes (0 = disabled).
	 */
	periodicCheckIntervalMinutes: number;

	/**
	 * Show an Obsidian Notice when a manifest is corrected.
	 */
	notifyOnCorrection: boolean;

	/**
	 * Include detailed logs in the developer console.
	 */
	verboseLogging: boolean;
}

export const DEFAULT_SETTINGS: DesktopOnlySettings = {
	enforcedPluginIds: [],
	enableWatcher: true,
	periodicCheckIntervalMinutes: 15,
	notifyOnCorrection: true,
	verboseLogging: false,
};

export interface PluginManifestInfo {
	id: string;
	name: string;
	version?: string;
	author?: string;
	description?: string;
	isDesktopOnly: boolean;
	hasDuplicateKeys: boolean;
	manifestRelativePath: string;
	manifestAbsolutePath: string;
}

export interface EnforceResult {
	pluginId: string;
	pluginName: string;
	fixed: boolean;
	previousIsDesktopOnly: boolean;
	hadDuplicateKeys: boolean;
	error?: string;
}
