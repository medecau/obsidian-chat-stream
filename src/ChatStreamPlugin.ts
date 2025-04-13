import { Plugin, App, PluginManifest, Menu, Editor, MarkdownView, EventRef } from 'obsidian' // Added Menu, Editor, MarkdownView, EventRef
import {
	ChatStreamSettings,
	DEFAULT_SETTINGS
} from './settings/ChatStreamSettings'
import SettingsTab from './settings/SettingsTab'
import { Logger } from './util/logging'
import { noteGenerator } from './noteGenerator'
import { CanvasNode } from './obsidian/canvas-internal' // Added CanvasNode

// Helper function for small delays
async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Obsidian plugin implementation.
 * Note: Canvas has no supported API. This plugin uses internal APIs that may change without notice.
 */
export class ChatStreamPlugin extends Plugin {
	settings: ChatStreamSettings
	logDebug: Logger

	constructor(app: App, pluginManifest: PluginManifest) { // Removed pluginPath as it's unused
		super(app, pluginManifest)
	}

	async onload() {
		await this.loadSettings()



		this.logDebug = this.settings.debug
			? (message?: unknown, ...optionalParams: unknown[]) =>
				console.debug('Chat Stream: ' + message, ...optionalParams)
			: () => { }

		this.logDebug('Debug logging enabled')

		const generator = noteGenerator(this.app, this.settings, this.logDebug)

		this.addSettingTab(new SettingsTab(this.app, this))

		this.addCommand({
			id: 'next-note',
			name: 'Create next note',
			callback: () => {
				generator.nextNote()
			},
			hotkeys: [
				{
					modifiers: ['Alt', 'Shift'],
					key: 'N'
				}
			]
		})

		this.addCommand({
			id: 'generate-note',
			name: 'Generate AI note',
			callback: () => {
				generator.generateNote()
			},
			hotkeys: [
				{
					modifiers: ['Alt', 'Shift'],
					key: 'G'
				}
			]
		})

		// Add context menu item for Canvas notes
		this.registerEvent(
			this.app.workspace.on('canvas:node-menu', (menu: Menu, node: CanvasNode) => {
				// Ensure we have a node and its associated canvas
				if (node && node.canvas) {
					// Optional: Check if it's a text node if needed later
					// const nodeData = node.getData();
					// if (nodeData.type === 'text' || nodeData.type === 'file') { ... }

					menu.addItem((item) => {
						item
							.setTitle('ChatStream: Generate Content')
							.setIcon('lucide-sparkles') // Or 'brain-circuit', 'bot', etc.
							.onClick(async () => {
								const canvas = node.canvas
								this.logDebug('Context menu item clicked for node:', node.id)

								// generateNote uses the current selection, so select the target node first
								canvas.selectOnly(node, false) // Select the node, don't start editing
								await canvas.requestSave() // Allow selection to register
								await sleep(50) // Brief pause before triggering generation

								// Call the existing function to generate the note
								generator.generateNote()
							})
					})
				}
			})
		)

		// Add context menu items for editor based on dynamic triggers
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
				// Retrieve the current actions *inside* the callback to ensure freshness
				const currentActions = this.settings.contextMenuActions

				if (!currentActions || currentActions.length === 0) {
					return // No actions defined in settings
				}

				// Iterate over the *current* actions retrieved above
				currentActions.forEach(action => {
					// Ensure the action has both a name and a prompt to be valid
					if (action.name && action.prompt) {
						menu.addItem((item) => {
							item
								.setTitle(action.name) // Use the action's name for the menu item
								.setIcon('lucide-wand') // Keep the icon (or adjust if needed)
								.onClick(async () => {
									// Get the editor content at the moment the item is clicked
									const currentContent = editor.getValue()
									// Prepend the action's prompt and a newline
									const newContent = `${action.prompt}\n${currentContent}`
									// Update the editor with the new content
									editor.setValue(newContent)
								})
						})
					}
				})
			})
		)
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
