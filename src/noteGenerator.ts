import { TiktokenModel, encodingForModel } from 'js-tiktoken'
import { App, ItemView, Notice } from 'obsidian'
import { CanvasNode } from './obsidian/canvas-internal'
import { CanvasView, calcHeight, createNode, addEdge } from './obsidian/canvas-patches'
import {
	// CHAT_MODELS, // Removed
	// ChatGPTModel, // Assuming this was related and also removed/unused
	// chatModelByName, // Removed
	ChatModelSettings, // Keep if still used elsewhere or needed for types
	getChatGPTCompletion
} from './openai/chatGPT'
import { openai } from './openai/chatGPT-types'
import {
	ChatStreamSettings,
	DEFAULT_SETTINGS,
} from './settings/ChatStreamSettings'
import { Logger } from './util/logging'
import { visitNodeAndAncestors } from './obsidian/canvasUtil'
import { readNodeContent } from './obsidian/fileUtil'

/**
 * Color for assistant notes: 6 == purple
 */
const assistantColor = '6'

/**
 * Height to use for placeholder note
 */
const placeholderNoteHeight = 60

/**
 * Height to use for new empty note
 */
const emptyNoteHeight = 100

export function noteGenerator(
	app: App,
	settings: ChatStreamSettings,
	logDebug: Logger
) {
	const canCallAI = () => {
		if (!settings.apiKey) {
			new Notice('Please set your OpenAI API key in the plugin settings')
			return false
		}

		return true
	}

	const nextNote = async () => {
		logDebug('Creating user note')

		const canvas = getActiveCanvas()
		if (!canvas) {
			logDebug('No active canvas')
			return
		}

		await canvas.requestFrame()

		const { selection } = canvas
		if (selection?.size !== 1) {
			return
		}
		const values = Array.from(selection.values()) as CanvasNode[]
		const node = values[0]

		if (node) {
			const created = createNode(canvas, node, {
				text: '',
				size: { height: emptyNoteHeight }
			})
			canvas.selectOnly(created, true /* startEditing */)

			// startEditing() doesn't work if called immediately
			await canvas.requestSave()
			await sleep(100)

			created.startEditing()
		}
	}

	const getActiveCanvas = () => {
		const maybeCanvasView = app.workspace.getActiveViewOfType(
			ItemView
		) as CanvasView | null
		return maybeCanvasView ? maybeCanvasView['canvas'] : null
	}

	const isSystemPromptNode = (text: string) =>
		text.trim().startsWith('SYSTEM PROMPT')

	const getSystemPrompt = async (node: CanvasNode) => {
		let foundPrompt: string | null = null

		await visitNodeAndAncestors(node, async (n: CanvasNode) => {
			const text = await readNodeContent(n)
			if (text && isSystemPromptNode(text)) {
				foundPrompt = text
				return false
			} else {
				return true
			}
		})

		return foundPrompt || settings.systemPrompt
	}

	const buildMessages = async (node: CanvasNode, actionPrompt?: string) => {
		const encoding = getEncoding(settings)

		const messages: openai.ChatCompletionRequestMessage[] = []
		let tokenCount = 0

		// Note: We are not checking for system prompt longer than context window.
		// That scenario makes no sense, though.
		const systemPrompt = await getSystemPrompt(node)
		if (systemPrompt) {
			tokenCount += encoding.encode(systemPrompt).length
		}

		const visit = async (node: CanvasNode, depth: number) => {
			if (settings.maxDepth && depth > settings.maxDepth) {
				return false
			}

			const nodeData = node.getData()
			let nodeText = (await readNodeContent(node))?.trim() || ''
			const inputLimit = getTokenLimit(settings)

			let shouldContinue = true
			if (!nodeText) {
				return shouldContinue
			}

			if (nodeText.startsWith('data:image')) {
				messages.unshift({
					content: [{
						'type': 'image_url',
						'image_url': { 'url': nodeText }
					}],
					role: 'user'
				})
			} else {
				if (isSystemPromptNode(nodeText)) {
					return true
				}

				let nodeTokens = encoding.encode(nodeText)
				let keptNodeTokens: number

				if (tokenCount + nodeTokens.length > inputLimit) {
					// will exceed input limit

					shouldContinue = false

					// Leaving one token margin, just in case
					const keepTokens = nodeTokens.slice(0, inputLimit - tokenCount - 1)
					const truncateTextTo = encoding.decode(keepTokens).length
					logDebug(
						`Truncating node text from ${nodeText.length} to ${truncateTextTo} characters`
					)
					nodeText = nodeText.slice(0, truncateTextTo)
					keptNodeTokens = keepTokens.length
				} else {
					keptNodeTokens = nodeTokens.length
				}

				tokenCount += keptNodeTokens

				const role: openai.ChatCompletionRequestMessageRoleEnum =
					nodeData.chat_role === 'assistant' ? 'assistant' : 'user'

				messages.unshift({
					content: nodeText,
					role
				})
			}

			return shouldContinue
		}

		await visitNodeAndAncestors(node, visit)

		if (messages.length) {
			if (systemPrompt) {
				messages.unshift({
					content: systemPrompt,
					role: 'system'
				})
			}

			// Add action prompt as a user message if provided
			if (actionPrompt) {
				messages.push({
					content: actionPrompt,
					role: 'user'
				})

				// Add the token count for the action prompt
				tokenCount += encoding.encode(actionPrompt).length
			}

			return { messages, tokenCount }
		} else {
			return { messages: [], tokenCount: 0 }
		}
	}

	const generateNote = async (
		action: any, // Replace 'any' with 'ChatStreamAction' if type is available in imports
		actionPrompt?: string,
		explicitLabel?: string
	) => {
		if (!canCallAI()) {
			return
		}

		logDebug('Creating AI note')

		const canvas = getActiveCanvas()
		if (!canvas) {
			logDebug('No active canvas')
			return
		}

		await canvas.requestFrame()

		const { selection } = canvas
		if (selection?.size !== 1) {
			return
		}
		const values = Array.from(selection.values())
		const node = values[0]

		if (node) {
			// Last typed characters might not be applied to note yet
			await canvas.requestSave()
			await sleep(200)

			const { messages, tokenCount } = await buildMessages(node, actionPrompt)
			if (!messages.length) {
				return
			}

			const created = createNode(
				canvas,
				node,
				{
					text: `Calling AI (${settings.apiModel})...`,
					size: { height: placeholderNoteHeight }
				},
				{
					color: assistantColor,
					chat_role: 'assistant'
				}
			)

			new Notice(
				`Sending ${messages.length} notes with ${tokenCount} tokens to GPT`
			)

			try {
				logDebug('messages', messages)

				const generated = await getChatGPTCompletion(
					settings.apiKey,
					settings.apiUrl,
					settings.apiModel,
					messages,
					{
						max_tokens: settings.maxResponseTokens || undefined,
						temperature: settings.temperature
					}
				)

				if (generated == null) {
					new Notice(`Empty or unreadable response from GPT`)
					canvas.removeNode(created)
					return
				}

				created.setText(generated)
				const height = calcHeight({
					text: generated,
					parentHeight: node.height
				})
				created.moveAndResize({
					height,
					width: created.width,
					x: created.x,
					y: created.y
				})

				// Connect the source note to the output note with a labeled edge
				const label = explicitLabel || action.name
				addEdge(
					canvas,
					crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2),
					{
						fromOrTo: 'from',
						side: 'bottom',
						node: node
					},
					{
						fromOrTo: 'to',
						side: 'top',
						node: created
					},
					label
				)

				const selectedNoteId =
					canvas.selection?.size === 1
						? Array.from(canvas.selection.values())?.[0]?.id
						: undefined

				if (selectedNoteId === node?.id || selectedNoteId == null) {
					// If the user has not changed selection, select the created node
					canvas.selectOnly(created, false /* startEditing */)
				}
			} catch (error) {
				new Notice(`Error calling GPT: ${error.message || error}`)
				canvas.removeNode(created)
			}

			await canvas.requestSave()
		}
	}

	return { nextNote, generateNote }
}

function getEncoding(settings: ChatStreamSettings) {
	// Since chatModelByName is removed, we rely directly on the model name
	// or the default. We lose the ability to use a different 'encodingFrom' model.
	const modelName = settings.apiModel || DEFAULT_SETTINGS.apiModel
	try {
		return encodingForModel(modelName as TiktokenModel)
	} catch (e) {
		console.warn(`Could not get encoding for model ${modelName}, falling back to gpt-3.5-turbo`, e)
		// Fallback to a common encoding if the specific model name isn't recognized by tiktoken
		return encodingForModel('gpt-3.5-turbo')
	}
}

function getTokenLimit(settings: ChatStreamSettings): number {
	// Since chatModelByName and CHAT_MODELS are removed, we cannot dynamically get the model's token limit.
	// Use the user-defined maxInputTokens if set, otherwise use a reasonable default.
	const defaultLimit = 8192 // A common default limit
	if (settings.maxInputTokens && settings.maxInputTokens > 0) {
		// If user set a limit, respect it (assuming it's less than the actual model limit)
		return settings.maxInputTokens
	} else {
		// If user set to 0 (or invalid), use the default limit.
		return defaultLimit
	}
}

/**
 * Generates a placeholder summary for a given note.
 * @param note The input note string.
 * @returns A summary string (first 100 chars + ellipsis).
 */
export function summarizeNote(note: string): string {
	const maxLength = 100
	if (note.length <= maxLength) {
		return note
	}
	return note.substring(0, maxLength) + '...'
}

/**
 * Extracts placeholder action items from a note.
 * @param note The input note string (currently unused).
 * @returns An array of placeholder action item strings.
 */
export function extractActionItems(note: string): string[] {
	// Placeholder: Return fixed action items
	// Future: Implement logic to find lines like "- [ ] Action" or similar
	return ['- [ ] Action item 1', '- [ ] Action item 2']
}

/**
 * Rewrites a note for clarity using a placeholder method (uppercase).
 * @param note The input note string.
 * @returns The note converted to uppercase.
 */
export function rewriteForClarity(note: string): string {
	// Placeholder: Convert to uppercase
	// Future: Implement actual clarity rewriting logic
	return note.toUpperCase()
}

/**
 * Generates placeholder questions based on a note.
 * @param note The input note string (currently unused).
 * @returns An array of placeholder question strings.
 */
export function generateQuestions(note: string): string[] {
	// Placeholder: Return fixed questions
	// Future: Implement logic to generate relevant questions
	return ['What is the main point of this note?', 'What are the key takeaways?', 'Are there any unclear parts?']
}
