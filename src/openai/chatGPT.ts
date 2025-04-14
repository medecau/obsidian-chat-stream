import { request, RequestUrlParam } from 'obsidian'
import { openai } from './chatGPT-types'

export const OPENAI_RESPONSES_URL = `https://api.openai.com/v1/responses`

export type ChatModelSettings = {
	name: string,
	tokenLimit: number,
	encodingFrom?: string
}

// Update defaultChatGPTSettings to use a hardcoded default model
export const defaultChatGPTSettings: Partial<openai.CreateResponsesRequest> =
{
	model: 'gpt-3.5-turbo', // Using hardcoded default as CHAT_MODELS is removed
	max_tokens: 500,
	temperature: 0,
	top_p: 1.0,
	presence_penalty: 0,
	frequency_penalty: 0,
	stop: []
}

export async function getChatGPTCompletion(
	apiKey: string,
	_apiUrl: string, // Parameter ignored, using constant below
	model: openai.CreateResponsesRequest['model'],
	input: openai.ChatCompletionRequestMessage[] | openai.CreateResponsesRequest['input'],
	settings?: Partial<
		Omit<openai.CreateResponsesRequest, 'input' | 'model'>
	>
): Promise<string | undefined> {
	const headers = {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json'
	}

	// Ensure model is using a supported name format
	let modelName = model
	// If model starts with 'o3', it's likely meant to be 'gpt-4o'
	if (modelName === 'o3-mini') {
		modelName = 'gpt-4o-mini'
		console.debug('Corrected model name from o3-mini to gpt-4o-mini')
	} else if (modelName && modelName.startsWith('o3')) {
		modelName = 'gpt-4o'
		console.debug('Corrected model name from o3 to gpt-4o')
	}

	// Convert input to the format expected by the API
	const formattedInput = input.map(msg => {
		// If content is an array (for image URLs, etc.), convert it to a string representation
		// This is a simplification - in a real implementation, you might need more complex handling
		const content = typeof msg.content === 'string'
			? msg.content
			: JSON.stringify(msg.content)

		return {
			role: msg.role,
			content: content
		}
	})

	const body = {
		input: formattedInput,
		model: modelName,
		...settings
	}

	// Ensure we use the full responses API endpoint URL
	const apiUrl = OPENAI_RESPONSES_URL
	console.debug('Requesting OpenAI API', { url: apiUrl, headers, body })
	const requestParam: RequestUrlParam = {
		url: apiUrl,
		method: 'POST',
		contentType: 'application/json',
		body: JSON.stringify(body),
		headers
	}

	try {
		const res: any = await request(requestParam)
			.then((response) => {
				console.debug('OpenAI API response', { response })
				return JSON.parse(response)
			})

		// Parse the response based on the new Responses API format
		// The output is in res.content array with items that have type: "output_text"
		if (res && Array.isArray(res.content)) {
			// Extract all text outputs and join them
			const textOutputs = res.content
				.filter((item: any) => item.type === "output_text")
				.map((item: any) => item.text)

			return textOutputs.join('')
		} else if (res && res.output) {
			// Try to parse as documented in API docs: output array with messages inside
			const firstMessage = Array.isArray(res.output) && res.output[0]
			if (firstMessage && firstMessage.content) {
				const textContent = firstMessage.content
					.filter((item: any) => item.type === "output_text")
					.map((item: any) => item.text)
					.join('')

				return textContent || undefined
			}
		}

		// Fallback to output_text helper if available
		return res?.output_text
	} catch (err) {
		console.error('OpenAI API request failed', {
			url: apiUrl,
			headers,
			body,
			error: err,
			response: err?.response || 'No response body'
		})
		if (err.code === 429) {
			console.error(
				'OpenAI API rate limit exceeded. If you have a free account, your credits may have been consumed or expired.'
			)
		}
		throw err
	}
}
