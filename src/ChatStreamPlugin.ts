import { Plugin, App, PluginManifest, Menu, Editor, MarkdownView, EventRef } from 'obsidian' // Added Menu, Editor, MarkdownView, EventRef
// Import the type declarations
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
				if (this.settings.actions && this.settings.actions.length > 0) {
					generator.generateNote(this.settings.actions[0])
				}
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
				// Ensure we have a node and its associated canvas before adding items
				if (node && node.canvas) {
					// Optional: Check if it's a text node if needed later
					// const nodeData = node.getData();
					// if (nodeData.type === 'text' || nodeData.type === 'file') { ... }

					// Add original "Generate Content" item
					menu.addItem((item) => {
						item
							.setTitle('ChatStream: Generate Content')
							.setIcon('lucide-sparkles') // Or 'brain-circuit', 'bot', etc.
							.onClick(async () => {
								const { canvas } = node
								this.logDebug('Context menu item clicked for node:', node.id)

								// generateNote uses the current selection, so select the target node first
								canvas.selectOnly(node, false) // Select the node, don't start editing
								await canvas.requestSave() // Allow selection to register
								await sleep(50) // Brief pause before triggering generation

								// Call the existing function to generate the note
								if (this.settings.actions && this.settings.actions.length > 0) {
									generator.generateNote(this.settings.actions[0])
								}
							})
					})

					// Add prompt actions from settings
					if (this.settings.actions && Array.isArray(this.settings.actions)) {
						this.settings.actions.forEach(action => {
							if (action.id && action.name) {
								menu.addItem((item) => {
									item
										.setTitle(action.name)
										.setIcon('lucide-wand')
										.onClick(async () => {
											if (action.prompt) {
												this.logDebug(`Executing canvas prompt action with prompt: ${action.prompt}`)
												// For canvas nodes, pass the action prompt to the generator
												const { canvas } = node
												canvas.selectOnly(node, false) // Select the node, don't start editing
												await canvas.requestSave() // Allow selection to register
												await sleep(50) // Brief pause before triggering generation

												generator.generateNote(action, action.prompt)
											}
										})
								})
							}
						})
					}


				}
			})
		)

		// Add context menu items for editor based on dynamic triggers
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
				// Add unified actions
				const unifiedActions = this.settings.actions || []

				// If no actions defined, return early
				if (unifiedActions.length === 0) {
					return
				}

				// Add prompt actions
				unifiedActions.forEach(action => {
					if (action.name && action.prompt) {
						menu.addItem((item) => {
							item
								.setTitle(action.name)
								.setIcon('lucide-wand')
								.onClick(async () => {
									const currentContent = editor.getValue()
									const newContent = `${action.prompt}\n${currentContent}`
									editor.setValue(newContent)
								})
						})
					}
				})
			})
		)
	}

	async loadSettings() {
		const loadedData = await this.loadData()
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData)

		await this.saveSettings()
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}