import { CHAT_MODELS, OPENAI_COMPLETIONS_URL } from 'src/openai/chatGPT'

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
	apiUrl: OPENAI_COMPLETIONS_URL,
	apiModel: CHAT_MODELS.GPT_35_TURBO.name,
	temperature: 1,
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
	debug: false,
	maxInputTokens: 0,
	maxResponseTokens: 0,
	maxDepth: 0
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
		const models = await fetchModels(apiUrl, apiKey)
		return models
	} catch (error) {
		console.error('Error fetching models:', error)
		return Object.entries(CHAT_MODELS).map(([, value]) => value.name)
	}
}
