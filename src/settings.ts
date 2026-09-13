import { App, PluginSettingTab, Setting } from "obsidian";
import type DesktopOnlyPlugin from "./main";
import { PluginManifestInfo } from "./types";

type FilterType = "all" | "enforced" | "not-enforced";

export class DesktopOnlySettingTab extends PluginSettingTab {
	private plugin: DesktopOnlyPlugin;
	private pluginsList: PluginManifestInfo[] = [];
	private searchQuery: string = "";
	private activeFilter: FilterType = "all";
	private listContainerEl: HTMLElement | null = null;
	private isLoading: boolean = false;

	constructor(app: App, plugin: DesktopOnlyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	public async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("desktop-only-settings");

		// Header & Summary
		containerEl.createEl("h2", { text: "Desktop-Only Enforcer" });
		
		const introEl = containerEl.createDiv({ cls: "setting-item-description" });
		introEl.createEl("p", {
			text: "Locks the 'isDesktopOnly: true' flag in the manifest.json of selected plugins. When plugins update and overwrite their manifest, this plugin automatically restores the flag so mobile devices never attempt to load them.",
		});

		// General Configuration Section
		containerEl.createEl("h3", { text: "Automation & Monitoring" });

		new Setting(containerEl)
			.setName("Enforce all now")
			.setDesc("Scan all installed plugins and enforce desktop-only on marked plugins immediately.")
			.addButton((button) => {
				button
					.setButtonText("Check & enforce now")
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText("Checking...");
						await this.plugin.enforcer.checkAndEnforceAll(true);
						button.setDisabled(false);
						button.setButtonText("Check & enforce now");
						await this.reloadPluginsList();
					});
			});

		new Setting(containerEl)
			.setName("Real-time file watcher")
			.setDesc("Automatically detect when a plugin's manifest is modified (e.g. after an update) and restore desktop-only status immediately.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableWatcher)
					.onChange(async (val) => {
						this.plugin.settings.enableWatcher = val;
						await this.plugin.saveSettings();
						this.plugin.watcher.restart();
					});
			});

		new Setting(containerEl)
			.setName("Periodic check interval")
			.setDesc("Periodic fallback scan to ensure manifests remain properly configured.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("0", "Disabled")
					.addOption("5", "Every 5 minutes")
					.addOption("15", "Every 15 minutes")
					.addOption("30", "Every 30 minutes")
					.addOption("60", "Every 60 minutes")
					.setValue(String(this.plugin.settings.periodicCheckIntervalMinutes))
					.onChange(async (val) => {
						this.plugin.settings.periodicCheckIntervalMinutes = Number(val);
						await this.plugin.saveSettings();
						this.plugin.restartInterval();
					});
			});

		new Setting(containerEl)
			.setName("Notify on correction")
			.setDesc("Display an Obsidian Notice when an overwritten manifest has been restored.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.notifyOnCorrection)
					.onChange(async (val) => {
						this.plugin.settings.notifyOnCorrection = val;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Verbose console logging")
			.setDesc("Print diagnostic information to Developer Tools console (Ctrl+Shift+I).")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.verboseLogging)
					.onChange(async (val) => {
						this.plugin.settings.verboseLogging = val;
						await this.plugin.saveSettings();
					});
			});

		// Plugins List Section
		containerEl.createEl("h3", { text: "Installed Community Plugins" });

		// Search and Filter Bar
		const controlsContainer = containerEl.createDiv({ cls: "desktop-only-controls" });

		new Setting(controlsContainer)
			.setName("Filter plugins")
			.setDesc("Search by plugin name or ID")
			.addSearch((search) => {
				search
					.setPlaceholder("Search plugins...")
					.setValue(this.searchQuery)
					.onChange((val) => {
						this.searchQuery = val.toLowerCase().trim();
						this.renderFilteredPlugins();
					});
			});

		// Filter pills
		const filterBar = controlsContainer.createDiv({ cls: "desktop-only-filter-pills" });
		this.createFilterPill(filterBar, "all", "All");
		this.createFilterPill(filterBar, "enforced", "Enforced");
		this.createFilterPill(filterBar, "not-enforced", "Not Enforced");

		// Container for the list
		this.listContainerEl = containerEl.createDiv({ cls: "desktop-only-plugins-list" });

		await this.reloadPluginsList();
	}

	private createFilterPill(container: HTMLElement, filterKey: FilterType, label: string): void {
		const pill = container.createEl("button", {
			text: label,
			cls: `desktop-only-pill ${this.activeFilter === filterKey ? "is-active" : ""}`,
		});
		pill.addEventListener("click", () => {
			this.activeFilter = filterKey;
			container.querySelectorAll(".desktop-only-pill").forEach((el) => el.removeClass("is-active"));
			pill.addClass("is-active");
			this.renderFilteredPlugins();
		});
	}

	private async reloadPluginsList(): Promise<void> {
		if (this.isLoading) return;
		this.isLoading = true;

		if (this.listContainerEl) {
			this.listContainerEl.empty();
			this.listContainerEl.createEl("div", {
				cls: "desktop-only-loading",
				text: "Scanning installed plugins...",
			});
		}

		try {
			this.pluginsList = await this.plugin.enforcer.scanAllPlugins();
		} catch (err) {
			console.error("[Desktop-Only Enforcer] Failed scanning plugins:", err);
		} finally {
			this.isLoading = false;
			this.renderFilteredPlugins();
		}
	}

	private renderFilteredPlugins(): void {
		if (!this.listContainerEl) return;
		this.listContainerEl.empty();

		const enforcedSet = new Set(this.plugin.settings.enforcedPluginIds);

		const filtered = this.pluginsList.filter((item) => {
			const matchesQuery =
				!this.searchQuery ||
				item.name.toLowerCase().includes(this.searchQuery) ||
				item.id.toLowerCase().includes(this.searchQuery);

			if (!matchesQuery) return false;

			const isEnforced = enforcedSet.has(item.id);
			if (this.activeFilter === "enforced") return isEnforced;
			if (this.activeFilter === "not-enforced") return !isEnforced;

			return true;
		});

		// Count summary
		const countSummary = this.listContainerEl.createDiv({ cls: "desktop-only-count-summary" });
		countSummary.setText(
			`Showing ${filtered.length} of ${this.pluginsList.length} plugins (${enforcedSet.size} enforced)`
		);

		if (filtered.length === 0) {
			const emptyMsg = this.listContainerEl.createDiv({ cls: "desktop-only-empty" });
			emptyMsg.setText("No plugins found matching the criteria.");
			return;
		}

		for (const pluginInfo of filtered) {
			const isEnforced = enforcedSet.has(pluginInfo.id);

			const itemSetting = new Setting(this.listContainerEl);

			// Name and metadata
			itemSetting.setName(pluginInfo.name);

			const descEl = document.createElement("div");
			descEl.addClass("desktop-only-item-desc");

			const idSpan = descEl.createEl("code", { text: pluginInfo.id });
			idSpan.addClass("desktop-only-id-tag");

			if (pluginInfo.version) {
				descEl.createSpan({ text: ` • v${pluginInfo.version}` });
			}

			// Status badge
			const badge = descEl.createEl("span", { cls: "desktop-only-badge" });
			if (isEnforced) {
				if (pluginInfo.isDesktopOnly) {
					badge.addClass("badge-enforced");
					badge.setText("Desktop Only (Protected)");
					badge.setAttr(
						"title",
						"Locked as desktop-only. Even if an update overwrites manifest.json, it will be restored immediately."
					);
				} else {
					badge.addClass("badge-warning");
					badge.setText("Restoring Desktop Only...");
				}
			} else {
				if (pluginInfo.isDesktopOnly) {
					badge.addClass("badge-desktop-unprotected");
					badge.setText("Desktop Only (Unprotected)");
					badge.setAttr(
						"title",
						"Currently has isDesktopOnly: true on disk, but is NOT guarded. If this plugin updates, it may revert to multiplatform."
					);
				} else {
					badge.addClass("badge-multiplatform");
					badge.setText("Universal (Desktop + Mobile)");
					badge.setAttr("title", "Allowed to run on both desktop and mobile devices.");
				}
			}

			if (pluginInfo.hasDuplicateKeys) {
				const dupTag = descEl.createEl("span", {
					cls: "desktop-only-badge badge-warning",
					text: "Duplicate keys cleaned",
				});
				dupTag.setAttr("title", "Found multiple isDesktopOnly declarations in manifest.json and cleaned them.");
			}

			itemSetting.setDesc(descEl);

			// Toggle switch
			itemSetting.addToggle((toggle) => {
				toggle
					.setValue(isEnforced)
					.setTooltip(
						isEnforced
							? "Stop protecting this plugin (un-enforce)"
							: "Protect this plugin as desktop-only across updates"
					)
					.onChange(async (checked) => {
						toggle.setDisabled(true);
						await this.plugin.enforcer.setPluginDesktopOnly(pluginInfo.id, checked);
						pluginInfo.isDesktopOnly = checked;
						toggle.setDisabled(false);
						this.renderFilteredPlugins();
					});
			});

		}
	}
}
