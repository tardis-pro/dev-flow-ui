/**
 * Unified multi-provider AI client supporting Gemini, Claude, Qwen, GLM, MiniMax, and Mercury.
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

export type AIProvider = 'gemini' | 'claude' | 'qwen' | 'glm' | 'minimax' | 'mercury';

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

async function generateGLMToken(apiKey: string): Promise<string> {
  const dot = apiKey.lastIndexOf('.');
  if (dot === -1) return apiKey;
  const id = apiKey.slice(0, dot);
  const secret = apiKey.slice(dot + 1);

  const now = Date.now();
  const toB64Url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const header = toB64Url({ alg: 'HS256', sign_type: 'SIGN' });
  const payload = toB64Url({ api_key: id, exp: now + 30_000, timestamp: now });
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signingInput}.${sigB64}`;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.5-flash',
  claude: 'claude-sonnet-4-6',
  qwen: 'qwen-plus',
  glm: 'glm-4.7',
  minimax: 'MiniMax-M2.5',
  mercury: 'mercury-2',
} as const;

const DEFAULT_MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;

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

function parseOpenAICompatResponse(
  data: unknown,
  provider: AIProvider,
): { content: string; tokensUsed?: number } {
  const response = data as {
    choices?: Array<{
      message?: { content?: string };
    }>;
    usage?: { total_tokens?: number };
    error?: { message?: string };
  };
  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    const detail = response.error?.message
      ?? JSON.stringify(data).slice(0, 200);
    throw new AIError(
      `${provider} returned empty or malformed response: ${detail}`,
      provider,
    );
  }
  return {
    content,
    tokensUsed: response.usage?.total_tokens,
  };
}

function buildOpenAICompatBody(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
): unknown {
  return {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
}

const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  gemini: {
    endpoint: (model: string) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers: () => ({
      'content-type': 'application/json',
    }),
    buildBody: (systemPrompt, userPrompt, _model, maxTokens) => ({
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
    buildBody: buildOpenAICompatBody,
    parseResponse: (data) => parseOpenAICompatResponse(data, 'qwen'),
  },

  glm: {
    endpoint: () => 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    headers: (apiKey: string) => ({
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }),
    buildBody: buildOpenAICompatBody,
    parseResponse: (data) => parseOpenAICompatResponse(data, 'glm'),
  },

  minimax: {
    endpoint: () => 'https://api.minimax.io/v1/chat/completions',
    headers: (apiKey: string) => ({
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }),
    buildBody: buildOpenAICompatBody,
    parseResponse: (data) => parseOpenAICompatResponse(data, 'minimax'),
  },


  mercury: {
    endpoint: () => 'https://api.inceptionlabs.ai/v1/chat/completions',
    headers: (apiKey: string) => ({
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }),
    buildBody: (systemPrompt, userPrompt, model, maxTokens) => ({
      model,
      max_tokens: maxTokens,
      reasoning_effort: 'instant',
      messages: [
        { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` },
      ],
    }),
    parseResponse: (data) => parseOpenAICompatResponse(data, 'mercury'),
  },
};

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

  const effectiveApiKey = provider === 'glm' ? await generateGLMToken(apiKey) : apiKey;

  let url = config.endpoint(model);
  if (provider === 'gemini') {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}key=${encodeURIComponent(effectiveApiKey)}`;
  }

  const body = config.buildBody(systemPrompt, userPrompt, model, maxTokens);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: config.headers(effectiveApiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new AIError(
        `${provider.charAt(0).toUpperCase() + provider.slice(1)} API error: ${response.status} ${response.statusText} — ${errorBody.slice(0, 300)}`,
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

    // Handle network/parse errors — NEVER include apiKey in message
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
