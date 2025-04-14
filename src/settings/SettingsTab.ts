import { App, PluginSettingTab, Setting, DropdownComponent, TextComponent, ButtonComponent, TextAreaComponent } from 'obsidian'
import { ChatStreamPlugin } from 'src/ChatStreamPlugin'
import { getModels } from './ChatStreamSettings'
// Default models are no longer imported from chatGPT.ts

export class SettingsTab extends PluginSettingTab {
	plugin: ChatStreamPlugin
	private modelDropdown: DropdownComponent | null = null;
	private apiKeyInput: TextComponent | null = null;
	private apiKeyValid: boolean = false; // Track API key validity

	constructor(app: App, plugin: ChatStreamPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	// Helper function to fetch models and update UI
	private async updateModelDropdownAndApiKeyStatus(): Promise<void> {

		if (!this.modelDropdown || !this.apiKeyInput) {
			return
		}

		const { apiKey, apiUrl } = this.plugin.settings

		// Disable dropdown and clear options initially
		this.modelDropdown.setDisabled(true)
		this.modelDropdown.selectEl.empty() // Clear existing options
		this.modelDropdown.addOption('', 'Enter API Key first') // Placeholder

		// Reset API key border
		this.apiKeyInput.inputEl.style.borderColor = ''
		this.apiKeyValid = false

		if (apiKey && apiUrl) {
			try {
				// Use the base API URL for fetching models
				const modelsApiUrl = apiUrl.endsWith('/chat/completions')
					? apiUrl.replace('/chat/completions', '')
					: apiUrl

				const models = await getModels(modelsApiUrl, apiKey)
				// Filter models based on specified patterns
				const filteredModels = models.filter(model => (/^gpt-|^o\d/.test(model)) && (!/-\d{4}-\d{2}-\d{2}$/.test(model)))
				// Sort filtered models alphabetically
				filteredModels.sort()
				// Clear placeholder/error message
				this.modelDropdown.selectEl.empty()
				// Add fetched models
				filteredModels.forEach((model) => {
					this.modelDropdown?.addOption(model, model)
				})
				// Set current value and enable
				this.modelDropdown.setValue(this.plugin.settings.apiModel)
				this.modelDropdown.setDisabled(false)
				this.apiKeyValid = true
				this.apiKeyInput.inputEl.style.borderColor = '' // Clear red border on success
				console.log("API Key validated and models fetched successfully.")
			} catch (error) {
				console.error("Failed to fetch models:", error)
				// Keep dropdown disabled, show error message
				this.modelDropdown.selectEl.empty()
				this.modelDropdown.addOption('', 'Invalid API Key or URL')
				this.modelDropdown.setDisabled(true)
				// Indicate API key is invalid
				this.apiKeyInput.inputEl.style.borderColor = 'red'
				this.apiKeyValid = false

				// Fallback: If fetching models failed, reset to a known default model
				// to prevent saving an invalid state.
				console.log("Resetting model to default due to fetch failure.")
				this.plugin.settings.apiModel = 'gpt-3.5-turbo' // Reset to hardcoded default
				await this.plugin.saveSettings()
				this.modelDropdown.setValue(this.plugin.settings.apiModel) // Show the (potentially reset) model
			}
		} else {
			// If no API key, ensure dropdown is disabled and shows placeholder
			this.modelDropdown.selectEl.empty()
			this.modelDropdown.addOption('', 'Enter API Key first')
			this.modelDropdown.setDisabled(true)
		}
	}


	async display(): Promise<void> {
		const { containerEl } = this
		containerEl.empty()

		// Model Dropdown Setting
		new Setting(containerEl)
			.setName('Model')
			.setDesc('Select the GPT model to use (requires valid API Key).')
			.addDropdown(async (cb) => {
				this.modelDropdown = cb // Store reference
				cb.setDisabled(true) // Initially disabled
				cb.addOption('', 'Enter API Key first') // Initial placeholder
				cb.setValue(this.plugin.settings.apiModel) // Set initial value (might be default)
				cb.onChange(async (value) => {
					if (this.apiKeyValid) { // Only save if the key was valid when models were fetched
						this.plugin.settings.apiModel = value
						await this.plugin.saveSettings()
					}
				})
				// Initial population will happen after all elements are created
			})

		// API Key Setting
		new Setting(containerEl)
			.setName('API key')
			.setDesc('The API key to use when making requests - Get from OpenAI')
			.addText((text) => {
				this.apiKeyInput = text // Store reference
				text.inputEl.type = 'password'
				text
					.setPlaceholder('API Key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						const changed = this.plugin.settings.apiKey !== value
						this.plugin.settings.apiKey = value
						await this.plugin.saveSettings()
						// Re-validate and update models if key changed
						if (changed) {
							await this.updateModelDropdownAndApiKeyStatus()
						}
					})
			})

		// System Prompt Setting
		new Setting(containerEl)
			.setName('System prompt')
			.setDesc(
				`The system prompt sent with each request to the API. \n(Note: you can override this by beginning a note stream with a note starting 'SYSTEM PROMPT'. The remaining content of that note will be used as system prompt.)`
			)
			.addTextArea((component) => {
				component.inputEl.rows = 6
				component.inputEl.style.width = '300px'
				component.inputEl.style.fontSize = '10px'
				component.setValue(this.plugin.settings.systemPrompt)
				component.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value
					await this.plugin.saveSettings()
				})
			})

		// Max Input Tokens Setting
		new Setting(containerEl)
			.setName('Max input tokens')
			.setDesc(
				'The maximum number of tokens to send (within model limit). 0 means as many as possible'
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.maxInputTokens.toString())
					.onChange(async (value) => {
						const parsed = parseInt(value)
						if (!isNaN(parsed)) {
							this.plugin.settings.maxInputTokens = parsed
							await this.plugin.saveSettings()
						}
					})
			)

		// Max Response Tokens Setting
		new Setting(containerEl)
			.setName('Max response tokens')
			.setDesc(
				'The maximum number of tokens to return from the API. 0 means no limit. (A token is about 4 characters).'
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.maxResponseTokens.toString())
					.onChange(async (value) => {
						const parsed = parseInt(value)
						if (!isNaN(parsed)) {
							this.plugin.settings.maxResponseTokens = parsed
							await this.plugin.saveSettings()
						}
					})
			)

		// Max Depth Setting
		new Setting(containerEl)
			.setName('Max depth')
			.setDesc(
				'The maximum depth of ancestor notes to include. 0 means no limit.'
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.maxDepth.toString())
					.onChange(async (value) => {
						const parsed = parseInt(value)
						if (!isNaN(parsed)) {
							this.plugin.settings.maxDepth = parsed
							await this.plugin.saveSettings()
						}
					})
			)

		// Temperature Setting
		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Sampling temperature (0-2). 0 means no randomness.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.temperature.toString())
					.onChange(async (value) => {
						const parsed = parseFloat(value)
						if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
							this.plugin.settings.temperature = parsed
							await this.plugin.saveSettings()
						}
					})
			)

		// API URL Setting
		new Setting(containerEl)
			.setName('API URL')
			.setDesc(
				"The base URL for the API (e.g., https://api.openai.com/v1). The correct endpoints like '/models' and '/chat/completions' will be appended automatically where needed."
			)
			.addText((text) => {
				text.inputEl.style.width = '300px'
				text
					.setPlaceholder('API Base URL')
					.setValue(this.plugin.settings.apiUrl)
					.onChange(async (value) => {
						// Basic validation: ensure it's not empty and looks like a URL start
						const trimmedValue = value.trim().replace(/\/+$/, '') // Remove trailing slashes
						const changed = this.plugin.settings.apiUrl !== trimmedValue

						if (trimmedValue && (trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://'))) {
							this.plugin.settings.apiUrl = trimmedValue
							await this.plugin.saveSettings()
							// Re-validate and update models if URL changed
							if (changed) {
								await this.updateModelDropdownAndApiKeyStatus()
							}
						} else {
							// Optionally provide feedback or prevent saving invalid URL
							console.warn("Invalid API URL format entered.")
							// Maybe reset to previous value or show error? For now, just log.
						}
					})
			})

		// Debug Output Setting
		new Setting(containerEl)
			.setName('Debug output')
			.setDesc('Enable debug output in the console')
			.addToggle((component) => {
				component
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value
						await this.plugin.saveSettings()
					})
			})

		// --- Unified Actions Section ---
		new Setting(containerEl)
			.setName('Actions')
			.setDesc('Configure actions that appear in the context menu')
			.setHeading()

		// Ensure actions exists and is an array
		if (!Array.isArray(this.plugin.settings.actions)) {
			this.plugin.settings.actions = []
			await this.plugin.saveSettings()
		}

		this.plugin.settings.actions.forEach((action, index) => {
			const setting = new Setting(containerEl) // Create the single setting container

			// --- Manual DOM Manipulation within setting.controlEl ---

			// Container for the top row (name input + type dropdown + delete button)
			const topRowContainer = setting.controlEl.createDiv({ cls: 'chat-stream-action-top-row' })
			topRowContainer.style.display = 'flex'        // Use flexbox for horizontal layout
			topRowContainer.style.alignItems = 'center'   // Vertically align items in the row
			topRowContainer.style.marginBottom = '8px'    // Space below the top row

			// Name Input Component (added to topRowContainer)
			const nameInput = new TextComponent(topRowContainer)
			nameInput.setPlaceholder('Action Name')
				.setValue(action.name)
				.onChange(async (value) => {
					this.plugin.settings.actions[index].name = value
					await this.plugin.saveSettings()
				})
			nameInput.inputEl.style.flexGrow = '1'       // Allow input to expand
			nameInput.inputEl.style.marginRight = '8px'  // Space between input and dropdown

			// Delete Button Component (added to topRowContainer)
			const deleteButton = new ButtonComponent(topRowContainer)
			deleteButton.setIcon('trash')
				.setTooltip('Delete Action')
				.setWarning() // Indicate destructive action
				.onClick(async () => {
					this.plugin.settings.actions.splice(index, 1)
					await this.plugin.saveSettings()
					this.display() // Re-render the settings tab
				})

			// Prompt Text Area Component for prompt actions
			const promptArea = new TextAreaComponent(setting.controlEl)
			promptArea.inputEl.rows = 3
			promptArea.inputEl.style.width = '100%' // Use full width
			promptArea.setPlaceholder('Action Prompt (e.g., Provide a concise summary...)')
				.setValue(action.prompt || '')
				.onChange(async (value) => {
					this.plugin.settings.actions[index].prompt = value
					await this.plugin.saveSettings()
				})

			// --- End Manual DOM Manipulation ---

			// Add a class to the main setting element for styling separation between actions
			setting.settingEl.addClass('chat-stream-action-item')
			// Add a top border for visual separation between action items, except for the first one
			if (index > 0) {
				setting.settingEl.style.borderTop = '1px solid var(--background-modifier-border)'
				setting.settingEl.style.paddingTop = '10px' // Add some padding above the border
			}
			// Remove default name/desc elements as we are not using .setName() or .setDesc()
			setting.nameEl.remove()
			setting.descEl.remove()
		})

		// Add Action Button
		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('Add Action')
				.setCta() // Make it stand out as a primary action
				.onClick(async () => {
					// Create a new prompt action
					this.plugin.settings.actions.push({
						id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
						name: '',
						type: 'prompt',
						prompt: ''
					})
					await this.plugin.saveSettings()
					this.display() // Re-render to show the new action fields
				}))

		// --- End Unified Actions Section ---


		// Now that all elements are created, attempt initial model population
		await this.updateModelDropdownAndApiKeyStatus()
	}
}

export default SettingsTab