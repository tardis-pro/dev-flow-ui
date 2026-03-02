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

// ============================================================================
// Unit Test Examples (vitest-style)
// ============================================================================

/*
// These tests demonstrate expected behavior and can be run with vitest

import { describe, it, expect, vi } from 'vitest';

describe('callAI', () => {
  // Mock fetch globally
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('Gemini', () => {
    it('should call Gemini with correct endpoint and body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Hello!' }] } }],
          usageMetadata: { totalTokenCount: 42 },
        }),
      });

      const response = await callAI({
        provider: 'gemini',
        apiKey: 'test-key',
        systemPrompt: 'Be helpful',
        userPrompt: 'Hi',
      });

      expect(response.content).toBe('Hello!');
      expect(response.provider).toBe('gemini');
      expect(response.model).toBe('gemini-2.0-flash');
      expect(response.tokensUsed).toBe(42);

      // Verify endpoint includes API key
      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[0]).toContain('key=test-key');
    });

    it('should use custom model when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
        }),
      });

      const response = await callAI({
        provider: 'gemini',
        apiKey: 'key',
        model: 'gemini-1.5-pro',
        systemPrompt: 'System',
        userPrompt: 'User',
      });

      expect(response.model).toBe('gemini-1.5-pro');
      expect((global.fetch as any).mock.calls[0][0]).toContain('gemini-1.5-pro');
    });
  });

  describe('Claude', () => {
    it('should call Claude with correct headers and body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Claude response' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const response = await callAI({
        provider: 'claude',
        apiKey: 'claude-key',
        systemPrompt: 'You are Claude',
        userPrompt: 'Hello Claude',
      });

      expect(response.content).toBe('Claude response');
      expect(response.tokensUsed).toBe(15);

      // Verify headers
      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[1].headers['x-api-key']).toBe('claude-key');
      expect(fetchCall[1].headers['anthropic-version']).toBe('2023-06-01');
    });
  });

  describe('Qwen', () => {
    it('should call Qwen with OpenAI-compatible format', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Qwen response' } }],
          usage: { total_tokens: 25 },
        }),
      });

      const response = await callAI({
        provider: 'qwen',
        apiKey: 'qwen-key',
        systemPrompt: 'System',
        userPrompt: 'Hello',
      });

      expect(response.content).toBe('Qwen response');
      expect(response.tokensUsed).toBe(25);

      // Verify auth header
      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBe('Bearer qwen-key');
    });
  });

  describe('Error handling', () => {
    it('should throw AIError on HTTP error without exposing API key', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(
        callAI({
          provider: 'claude',
          apiKey: 'secret-key-12345',
          systemPrompt: 'System',
          userPrompt: 'User',
        }),
      ).rejects.toThrow(AIError);

      try {
        await callAI({
          provider: 'claude',
          apiKey: 'secret-key-12345',
          systemPrompt: 'System',
          userPrompt: 'User',
        });
      } catch (e) {
        expect(e).toBeInstanceOf(AIError);
        expect((e as AIError).provider).toBe('claude');
        expect((e as AIError).statusCode).toBe(401);
        // Critical: API key must NEVER appear in error message
        expect((e as Error).message).not.toContain('secret-key-12345');
      }
    });

    it('should throw AIError on timeout', async () => {
      vi.useFakeTimers();

      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            // Simulate a hanging request that gets aborted
          }),
      );

      const promise = callAI({
        provider: 'gemini',
        apiKey: 'key',
        systemPrompt: 'System',
        userPrompt: 'User',
      });

      // Fast-forward past timeout
      await vi.advanceTimersByTimeAsync(60_000);

      await expect(promise).rejects.toThrow(AIError);
      await expect(promise).rejects.toThrow('timed out');

      vi.useRealTimers();
    });

    it('should throw AIError on malformed response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [] }), // Empty candidates
      });

      await expect(
        callAI({
          provider: 'gemini',
          apiKey: 'key',
          systemPrompt: 'System',
          userPrompt: 'User',
        }),
      ).rejects.toThrow(AIError);

      try {
        await callAI({
          provider: 'gemini',
          apiKey: 'key',
          systemPrompt: 'System',
          userPrompt: 'User',
        });
      } catch (e) {
        expect((e as Error).message).toContain('empty or malformed');
      }
    });
  });

  describe('AIError class', () => {
    it('should have correct properties', () => {
      const error = new AIError('Test error', 'claude', 500);

      expect(error.name).toBe('AIError');
      expect(error.message).toBe('Test error');
      expect(error.provider).toBe('claude');
      expect(error.statusCode).toBe(500);
      expect(error).toBeInstanceOf(Error);
    });

    it('should work without statusCode', () => {
      const error = new AIError('Network error', 'qwen');

      expect(error.provider).toBe('qwen');
      expect(error.statusCode).toBeUndefined();
    });
  });
});
*/
