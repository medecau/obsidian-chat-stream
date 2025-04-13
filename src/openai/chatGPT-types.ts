/* eslint-disable @typescript-eslint/no-namespace */

/**
 * @see https://raw.githubusercontent.com/transitive-bullshit/chatgpt-api/main/src/types.ts
 * @see https://beta.openai.com/docs/api-reference/completions/create
 */

export type Role = 'user' | 'assistant' | 'system' | 'developer'

export namespace openai {
	export interface CreateResponsesRequest {
		model: string
		input: Array<{ role: string; content: string }>
		max_tokens?: number
		temperature?: number
		top_p?: number
		frequency_penalty?: number
		presence_penalty?: number
		stop?: string[]
	}

	export interface OutputTextContent {
		type: 'output_text'
		text: string
		annotations: any[]
	}

	export interface MessageContent {
		id: string
		type: 'message'
		role: 'assistant'
		content: OutputTextContent[]
	}

	export interface CreateResponsesResponse {
		id: string
		output: MessageContent[]
		// Helper field available in some SDKs
		output_text?: string
	}
}
