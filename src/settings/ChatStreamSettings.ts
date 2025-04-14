import { OPENAI_RESPONSES_URL } from 'src/openai/chatGPT'

export interface ChatStreamAction {
	id: string
	name: string
	prompt?: string
}

export interface ChatStreamCustomAction {
	slug: string
	name: string
	// Add other properties as needed
}


export interface ChatStreamSettings {
	/**
	 * The API key to use when making requests
	 */
	apiKey: string

	/**
	 * The URL endpoint for chat
	 */
	apiUrl: string

	/**
	 * The GPT model to use
	 */
	apiModel: string

	/**
	 * The temperature to use when generating responses (0-2). 0 means no randomness.
	 */
	temperature: number

	/**
	 * The system prompt sent with each request to the API
	 */
	systemPrompt: string

	/**
	 * Enable debug output in the console
	 */
	debug: boolean

	/**
	 * The maximum number of tokens to send (up to model limit). 0 means as many as possible.
	 */
	maxInputTokens: number

	/**
	 * The maximum number of tokens to return from the API. 0 means no limit. (A token is about 4 characters).
	 */
	maxResponseTokens: number

	/**
	 * The maximum depth of ancestor notes to include. 0 means no limit.
	 */
	maxDepth: number

	/**
	 * Unified actions available in the context menu.
	 * These can be either prompt actions or command actions.
	 */
	actions: ChatStreamAction[]

	/**
	 * User-defined custom actions for note connections.
	 */
	customActions: ChatStreamCustomAction[]
}

export const DEFAULT_SYSTEM_PROMPT = `
You are a critical-thinking assistant bot. 
Consider the intent of my questions before responding.
Do not restate my information unless I ask for it. 
Do not include caveats or disclaimers.
Use step-by-step reasoning. Be brief.
`.trim()

export const DEFAULT_SETTINGS: ChatStreamSettings = {
	apiKey: '',
	apiUrl: OPENAI_RESPONSES_URL,
	apiModel: 'gpt-3.5-turbo', // Use hardcoded default as CHAT_MODELS is removed
	temperature: 1,
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
	debug: false,
	maxInputTokens: 0,
	maxResponseTokens: 0,
	maxDepth: 0,
	actions: [],
	customActions: []
}

export async function fetchModels(apiUrl: string, apiKey: string): Promise<string[]> {
	const headers = {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json'
	}
	const response = await fetch(`${apiUrl}/models`, { headers })
	const data = await response.json()
	return data.data.map((model: { id: string }) => model.id)
}

export async function getModels(apiUrl: string, apiKey: string): Promise<string[]> {
	try {
		return await fetchModels(apiUrl, apiKey)
	} catch (error) {
		console.error('Error fetching models:', error)
		// Re-throw the error to allow the caller to handle UI feedback
		throw error
	}
}
