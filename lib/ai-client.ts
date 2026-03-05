/**
 * Unified multi-provider AI client supporting Gemini, Claude, and Qwen.
 *
 * @module lib/ai-client
 *
 * Usage:
 *   const response = await callAI({
 *     provider: 'gemini',
 *     apiKey: process.env.GEMINI_API_KEY,
 *     systemPrompt: 'You are a helpful assistant.',
 *     userPrompt: 'Hello!',
 *   });
 */

// ============================================================================
// Types
// ============================================================================

export type AIProvider = 'gemini' | 'claude' | 'qwen';

export type AIRequest = {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
};

export type AIResponse = {
  content: string;
  provider: AIProvider;
  model: string;
  tokensUsed?: number;
};

export class AIError extends Error {
  constructor(
    message: string,
    public readonly provider: AIProvider,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.0-flash',
  claude: 'claude-sonnet-4-20250514',
  qwen: 'qwen-plus',
} as const;

const DEFAULT_MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;

// ============================================================================
// Provider Implementations
// ============================================================================

interface ProviderConfig {
  endpoint: (model: string) => string;
  headers: (apiKey: string) => Record<string, string>;
  buildBody: (
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number,
  ) => unknown;
  parseResponse: (data: unknown) => { content: string; tokensUsed?: number };
}

const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  gemini: {
    endpoint: (model: string) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers: () => ({
      'content-type': 'application/json',
    }),
    buildBody: (systemPrompt, userPrompt, model, maxTokens) => ({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
    parseResponse: (data: unknown) => {
      const response = data as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
        usageMetadata?: { totalTokenCount?: number };
      };
      const content = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new AIError(
          'Gemini returned empty or malformed response',
          'gemini',
        );
      }
      return {
        content,
        tokensUsed: response.usageMetadata?.totalTokenCount,
      };
    },
  },

  claude: {
    endpoint: () => 'https://api.anthropic.com/v1/messages',
    headers: (apiKey: string) => ({
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }),
    buildBody: (systemPrompt, userPrompt, model, maxTokens) => ({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    parseResponse: (data: unknown) => {
      const response = data as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const textBlock = response.content?.find(
        (block) => block.type === 'text',
      );
      if (!textBlock?.text) {
        throw new AIError(
          'Claude returned empty or malformed response',
          'claude',
        );
      }
      const tokensUsed =
        (response.usage?.input_tokens ?? 0) +
        (response.usage?.output_tokens ?? 0);
      return { content: textBlock.text, tokensUsed };
    },
  },

  qwen: {
    endpoint: () =>
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    headers: (apiKey: string) => ({
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }),
    buildBody: (systemPrompt, userPrompt, model, maxTokens) => ({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    parseResponse: (data: unknown) => {
      const response = data as {
        choices?: Array<{
          message?: { content?: string };
        }>;
        usage?: { total_tokens?: number };
      };
      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new AIError(
          'Qwen returned empty or malformed response',
          'qwen',
        );
      }
      return {
        content,
        tokensUsed: response.usage?.total_tokens,
      };
    },
  },
};

// ============================================================================
// Main Function
// ============================================================================

/**
 * Calls an AI provider with the given request parameters.
 *
 * @param request - The AI request configuration
 * @returns The AI response with content, provider, model, and optional token count
 * @throws AIError if the request fails or returns malformed data
 *
 * @example
 * // Basic usage with Gemini
 * const response = await callAI({
 *   provider: 'gemini',
 *   apiKey: 'your-api-key',
 *   systemPrompt: 'You are a helpful coding assistant.',
 *   userPrompt: 'Explain TypeScript generics.',
 * });
 * console.log(response.content);
 *
 * @example
 * // Using Claude with custom model
 * const response = await callAI({
 *   provider: 'claude',
 *   apiKey: 'your-api-key',
 *   model: 'claude-3-5-sonnet-20241022',
 *   systemPrompt: 'You are a code reviewer.',
 *   userPrompt: 'Review this PR...',
 *   maxTokens: 8192,
 * });
 *
 * @example
 * // Using Qwen
 * const response = await callAI({
 *   provider: 'qwen',
 *   apiKey: 'your-api-key',
 *   systemPrompt: 'Translate to Chinese.',
 *   userPrompt: 'Hello, world!',
 * });
 */
export async function callAI(request: AIRequest): Promise<AIResponse> {
  const {
    provider,
    apiKey,
    model = DEFAULT_MODELS[provider],
    systemPrompt,
    userPrompt,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = request;

  const config = PROVIDER_CONFIGS[provider];

  // Build URL - Gemini needs API key in query string
  let url = config.endpoint(model);
  if (provider === 'gemini') {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}key=${encodeURIComponent(apiKey)}`;
  }

  // Build request body
  const body = config.buildBody(systemPrompt, userPrompt, model, maxTokens);

  // Setup timeout with AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: config.headers(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AIError(
        `${provider.charAt(0).toUpperCase() + provider.slice(1)} API error: ${response.status} ${response.statusText}`,
        provider,
        response.status,
      );
    }

    const data: unknown = await response.json();
    const { content, tokensUsed } = config.parseResponse(data);

    return {
      content,
      provider,
      model,
      tokensUsed,
    };
  } catch (error) {
    // Re-throw AIError as-is
    if (error instanceof AIError) {
      throw error;
    }

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AIError(
        `${provider.charAt(0).toUpperCase() + provider.slice(1)} request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        provider,
      );
    }

    // Handle network/parse errors - NEVER include apiKey in message
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    throw new AIError(
      `${provider.charAt(0).toUpperCase() + provider.slice(1)} request failed: ${message}`,
      provider,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

