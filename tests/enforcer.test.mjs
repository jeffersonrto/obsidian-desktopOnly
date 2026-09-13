import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
	if (request === "obsidian") {
		return require.resolve("./obsidian-mock.cjs");
	}
	return originalResolve.call(this, request, parent, isMain, options);
};


// Helper to create a mock App and adapter
function createMockApp(tempDir) {
	const pluginsDir = path.join(tempDir, ".obsidian", "plugins");
	fs.mkdirSync(pluginsDir, { recursive: true });

	const inMemoryManifests = {};

	const adapter = {
		getBasePath: () => tempDir,
		exists: async (relPath) => fs.existsSync(path.join(tempDir, relPath)),
		read: async (relPath) => fs.readFileSync(path.join(tempDir, relPath), "utf-8"),
		write: async (relPath, content) => {
			const fullPath = path.join(tempDir, relPath);
			fs.mkdirSync(path.dirname(fullPath), { recursive: true });
			fs.writeFileSync(fullPath, content, "utf-8");
		},
		list: async (relPath) => {
			const fullPath = path.join(tempDir, relPath);
			if (!fs.existsSync(fullPath)) return { files: [], folders: [] };
			const entries = fs.readdirSync(fullPath, { withFileTypes: true });
			return {
				files: entries.filter((e) => e.isFile()).map((e) => `${relPath}/${e.name}`),
				folders: entries.filter((e) => e.isDirectory()).map((e) => `${relPath}/${e.name}`),
			};
		},
	};

	return {
		vault: {
			configDir: ".obsidian",
			adapter,
		},
		workspace: {
			onLayoutReady: (fn) => fn(),
		},
		plugins: {
			manifests: inMemoryManifests,
		},
	};
}


// Dynamically import compiled bundle or module
// We can test EnforcerService directly via ES module
test("Desktop-Only Enforcer core logic", async (t) => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-desktop-test-"));
	const mockApp = createMockApp(tempDir);

	// Dynamically require the compiled CommonJS bundle
	const mainModule = require(path.resolve("main.js"));
	const DesktopOnlyPlugin = mainModule.default || mainModule;
	const pluginInstance = new DesktopOnlyPlugin();
	pluginInstance.app = mockApp;
	pluginInstance.loadData = async () => ({
		enforcedPluginIds: ["smart-lookup", "omnisearch"],
		enableWatcher: false,
		periodicCheckIntervalMinutes: 0,
		notifyOnCorrection: false,
		verboseLogging: false,
	});
	pluginInstance.saveSettings = async () => {};

	// Initialize enforcer
	await pluginInstance.onload();
	const enforcer = pluginInstance.enforcer;


	await t.test("deduplicates duplicate isDesktopOnly keys and enforces true", async () => {
		const smartLookupDir = path.join(tempDir, ".obsidian", "plugins", "smart-lookup");
		fs.mkdirSync(smartLookupDir, { recursive: true });

		// Exact malformed manifest with duplicate keys as reported by user
		const rawDuplicateManifest = `{
  "id": "smart-lookup",
  "name": "Smart Lookup",
  "author": "Brian Petro",
  "description": "Semantic search for your vault.",
  "minAppVersion": "1.8.7",
  "authorUrl": "https://smartconnections.app",
  "isDesktopOnly": false,
  "version": "0.3.4",
  "isDesktopOnly": true
}`;
		fs.writeFileSync(path.join(smartLookupDir, "manifest.json"), rawDuplicateManifest);
		mockApp.plugins.manifests["smart-lookup"] = { id: "smart-lookup", isDesktopOnly: false };

		// Scan plugins

		const plugins = await enforcer.scanAllPlugins();
		assert.equal(plugins.length, 1);
		assert.equal(plugins[0].id, "smart-lookup");
		assert.equal(plugins[0].hasDuplicateKeys, true);

		// Enforce
		const result = await enforcer.enforcePlugin("smart-lookup");
		assert.ok(result);
		assert.equal(result.fixed, true);

		// Read back
		const updatedRaw = fs.readFileSync(path.join(smartLookupDir, "manifest.json"), "utf-8");
		const keyMatches = updatedRaw.match(/"isDesktopOnly"\s*:/g);
		assert.equal(keyMatches?.length, 1, "Duplicate keys must be removed");

		const parsed = JSON.parse(updatedRaw);
		assert.equal(parsed.isDesktopOnly, true);
		assert.equal(mockApp.plugins.manifests["smart-lookup"]?.isDesktopOnly, true);
	});

	await t.test("fixes an updated manifest that reverted to isDesktopOnly: false", async () => {
		const omnisearchDir = path.join(tempDir, ".obsidian", "plugins", "omnisearch");
		fs.mkdirSync(omnisearchDir, { recursive: true });

		// Simulate upstream update overwriting manifest with isDesktopOnly: false
		const upstreamUpdatedManifest = `{
  "id": "omnisearch",
  "name": "Omnisearch",
  "author": "Scidian",
  "description": "Fast search in Obsidian",
  "version": "1.10.0",
  "isDesktopOnly": false
}`;
		fs.writeFileSync(path.join(omnisearchDir, "manifest.json"), upstreamUpdatedManifest);

		const result = await enforcer.enforcePlugin("omnisearch");
		assert.ok(result);
		assert.equal(result.fixed, true);
		assert.equal(result.previousIsDesktopOnly, false);

		const parsed = JSON.parse(fs.readFileSync(path.join(omnisearchDir, "manifest.json"), "utf-8"));
		assert.equal(parsed.isDesktopOnly, true);
	});

	await t.test("does not touch plugins not in enforced list", async () => {
		const cmdrDir = path.join(tempDir, ".obsidian", "plugins", "cmdr");
		fs.mkdirSync(cmdrDir, { recursive: true });

		const cmdrManifest = `{
  "id": "cmdr",
  "name": "Commander",
  "version": "0.5.1",
  "isDesktopOnly": false
}`;
		fs.writeFileSync(path.join(cmdrDir, "manifest.json"), cmdrManifest);

		const result = await enforcer.enforcePlugin("cmdr");
		assert.ok(result);
		assert.equal(result.fixed, false);

		const contentAfter = fs.readFileSync(path.join(cmdrDir, "manifest.json"), "utf-8");
		assert.equal(contentAfter, cmdrManifest);
	});

	await t.test("checkAndEnforceAll processes all configured plugins", async () => {
		// Reset omnisearch to false to test batch enforcement
		const omnisearchManifestPath = path.join(tempDir, ".obsidian", "plugins", "omnisearch", "manifest.json");
		const manifest = JSON.parse(fs.readFileSync(omnisearchManifestPath, "utf-8"));
		manifest.isDesktopOnly = false;
		fs.writeFileSync(omnisearchManifestPath, JSON.stringify(manifest, null, 2));

		const batchResults = await enforcer.checkAndEnforceAll(false);
		const fixed = batchResults.filter((r) => r.fixed);
		assert.equal(fixed.length, 1);
		assert.equal(fixed[0].pluginId, "omnisearch");

		const finalOmnisearch = JSON.parse(fs.readFileSync(omnisearchManifestPath, "utf-8"));
		assert.equal(finalOmnisearch.isDesktopOnly, true);
	});

	await t.test("PluginsWatcher automatically fixes manifests in real time when modified", async () => {
		enforcer.clearRecentWrites();
		pluginInstance.settings.enableWatcher = true;
		const watcher = pluginInstance.watcher;
		watcher.start();

		// Allow watcher to attach
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Create a plugin directory that is in enforced list

		const targetManifestPath = path.join(tempDir, ".obsidian", "plugins", "omnisearch", "manifest.json");

		// Simulate an external update reverting to isDesktopOnly: false
		const updateData = {
			id: "omnisearch",
			name: "Omnisearch",
			version: "1.10.1",
			isDesktopOnly: false,
		};
		fs.writeFileSync(targetManifestPath, JSON.stringify(updateData, null, 2));

		// Wait for debounced watcher (600ms + buffer)
		await new Promise((resolve) => setTimeout(resolve, 1000));

		const readBack = JSON.parse(fs.readFileSync(targetManifestPath, "utf-8"));
		assert.equal(readBack.isDesktopOnly, true, "Watcher must automatically restore isDesktopOnly: true");

		watcher.stop();
	});

	// Cleanup

	pluginInstance.onunload();
	fs.rmSync(tempDir, { recursive: true, force: true });
});
