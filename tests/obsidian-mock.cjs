class Plugin {
	constructor(app, manifest) {
		this.app = app;
		this.manifest = manifest;
	}
	async loadData() {
		return {};
	}
	async saveData(data) {}
	addSettingTab(tab) {}
	addCommand(cmd) {}
	registerInterval(id) {}
}

class PluginSettingTab {
	constructor(app, plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = {
			empty() {},
			addClass() {},
			createEl(tag, opts) {
				return { addClass() {}, removeClass() {}, addEventListener() {}, setText() {} };
			},
			createDiv(opts) {
				return this.createEl("div", opts);
			},
		};
	}
}

class Setting {
	constructor(containerEl) {}
	setName() { return this; }
	setDesc() { return this; }
	addButton(cb) { cb({ setButtonText() { return this; }, setCta() { return this; }, setDisabled() { return this; }, onClick() { return this; } }); return this; }
	addToggle(cb) { cb({ setValue() { return this; }, setTooltip() { return this; }, setDisabled() { return this; }, onChange() { return this; } }); return this; }
	addDropdown(cb) { cb({ addOption() { return this; }, setValue() { return this; }, onChange() { return this; } }); return this; }
	addSearch(cb) { cb({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; } }); return this; }
}

class FileSystemAdapter {
	getBasePath() {
		return "";
	}
}

class Notice {
	constructor(message, duration) {
		this.message = message;
		this.duration = duration;
	}
}

module.exports = {
	Plugin,
	PluginSettingTab,
	Setting,
	FileSystemAdapter,
	Notice,
};
