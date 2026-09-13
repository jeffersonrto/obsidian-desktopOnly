import { Plugin } from "obsidian";
import { EnforcerService } from "./enforcer";
import { DesktopOnlySettingTab } from "./settings";
import { DEFAULT_SETTINGS, DesktopOnlySettings } from "./types";
import { PluginsWatcher } from "./watcher";

export default class DesktopOnlyPlugin extends Plugin {
	settings: DesktopOnlySettings = DEFAULT_SETTINGS;
	enforcer: EnforcerService;
	watcher: PluginsWatcher;
	private checkIntervalId: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.enforcer = new EnforcerService(
			this.app,
			() => this.settings,
			() => this.saveSettings()
		);

		this.watcher = new PluginsWatcher(this.enforcer, () => this.settings);

		// Settings Tab
		this.addSettingTab(new DesktopOnlySettingTab(this.app, this));

		// Command Palette: Force scan and enforce
		this.addCommand({
			id: "check-and-enforce-desktop-only",
			name: "Check and enforce desktop-only plugins now",
			callback: async () => {
				await this.enforcer.checkAndEnforceAll(true);
			},
		});

		// Command Palette: Scan all plugins and print diagnostic
		this.addCommand({
			id: "diagnose-plugin-manifests",
			name: "Show summary of desktop-only status in console",
			callback: async () => {
				const list = await this.enforcer.scanAllPlugins();
				console.table(
					list.map((p) => ({
						Name: p.name,
						ID: p.id,
						"isDesktopOnly (disk)": p.isDesktopOnly,
						"Enforced by Rule": this.settings.enforcedPluginIds.includes(p.id),
						"Duplicate Keys Found": p.hasDuplicateKeys,
					}))
				);
			},
		});

		// Run when layout is ready
		this.app.workspace.onLayoutReady(async () => {
			// 1. Enforce immediately upon startup
			await this.enforcer.checkAndEnforceAll(false);

			// 2. Start file system watcher if enabled
			if (this.settings.enableWatcher) {
				this.watcher.start();
			}

			// 3. Register periodic interval
			this.restartInterval();
		});
	}

	onunload(): void {
		if (this.watcher) {
			this.watcher.stop();
		}
		if (this.checkIntervalId !== null) {
			clearInterval(this.checkIntervalId);
			this.checkIntervalId = null;
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	public restartInterval(): void {
		if (this.checkIntervalId !== null) {
			clearInterval(this.checkIntervalId);
			this.checkIntervalId = null;
		}

		const minutes = this.settings.periodicCheckIntervalMinutes;
		if (minutes > 0) {
			const ms = minutes * 60 * 1000;
			const id = setInterval(async () => {
				if (this.settings.verboseLogging) {
					console.log("[Desktop-Only Enforcer] Running periodic manifest check...");
				}
				await this.enforcer.checkAndEnforceAll(false);
			}, ms);

			this.checkIntervalId = id as unknown as number;
			this.registerInterval(id as unknown as number);
		}
	}

}
