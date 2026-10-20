import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatProvider {
  complete(messages: ChatMessage[]): Promise<string>;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export class OpenAIChatProvider implements ChatProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model: string;
      timeoutMs: number;
      maxTokens: number;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    if (!this.options.apiKey) {
      throw new AppError(503, 'AI_NOT_CONFIGURED', 'Set OPENAI_API_KEY before saving content or asking questions.');
    }
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const fetchImpl = this.options.fetchImpl ?? fetch;
    try {
      const response = await fetchImpl(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0,
          max_tokens: this.options.maxTokens,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: controller.signal,
      });
      if (response.status === 429) {
        throw new AppError(429, 'RATE_LIMITED', 'The answer service is rate limiting requests. Try again shortly.');
      }
      if (!response.ok) {
        throw new AppError(502, 'LLM_FAILED', 'The answer service could not complete this question.');
      }
      const body = (await response.json()) as ChatResponse;
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new AppError(502, 'LLM_INVALID_RESPONSE', 'The answer service returned an empty response.');
      }
      logger.info('llm.completed', {
        model: this.options.model,
        durationMs: Date.now() - started,
      });
      return content;
    } catch (error) {
      logger.error('llm.failed', {
        model: this.options.model,
        code: error instanceof AppError ? error.code : 'LLM_FAILED',
        durationMs: Date.now() - started,
      });
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(502, 'LLM_TIMEOUT', 'The answer service timed out.');
      }
      throw new AppError(502, 'LLM_FAILED', 'The answer service could not be reached.');
    } finally {
      clearTimeout(timer);
    }
  }
}
