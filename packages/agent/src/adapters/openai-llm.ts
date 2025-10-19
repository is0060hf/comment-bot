/**
 * Tsumiki AITDD - Green Phase
 * タスク50: OpenAI LLMアダプタ実装
 */

import {
  LLMPort,
  LLMMessage,
  CommentGenerationContext,
  CommentGenerationResult,
  CommentOpportunityContext,
  CommentClassificationResult,
  CommentClassification,
  ChatResult,
  LLMError,
} from '../ports/llm';
import OpenAI from 'openai';
import { Logger } from '../logging/logger';

export interface OpenAILLMConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  logger?: Logger;
}

export class OpenAILLMAdapter implements LLMPort {
  private openai: OpenAI;
  private config: OpenAILLMConfig;
  private logger?: Logger;

  constructor(config: OpenAILLMConfig) {
    this.config = {
      model: 'gpt-4o-mini',
      maxTokens: 100,
      temperature: 0.7,
      ...config,
    };
    this.logger = config.logger;
    this.openai = new OpenAI({ apiKey: config.apiKey });
  }

  async generateComment(context: CommentGenerationContext): Promise<CommentGenerationResult> {
    try {
      const systemPrompt = this.createCommentSystemPrompt(context);
      const userPrompt = this.createCommentUserPrompt(context);

      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        response_format: { type: 'json_object' },
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No response from OpenAI');
      }

      // トークン使用量をログ
      if (response.usage) {
        this.logger?.debug('OpenAI token usage', {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        });
      }

      // finish_reasonをチェック
      if (choice.finish_reason === 'length') {
        this.logger?.warn('Token limit reached, response may be truncated');
      }

      // JSON応答をパース
      let result: any;
      try {
        result = JSON.parse(choice.message.content || '{}');
      } catch {
        // JSONパースに失敗した場合は、プレーンテキストとして扱う
        result = {
          comment: choice.message.content || '',
          confidence: 0.7,
        };
      }

      return {
        comment: result.comment || '',
        confidence: result.confidence ?? 0.8,
      };
    } catch (error: any) {
      this.logger?.error('OpenAI comment generation error', error);
      throw new LLMError(
        'Failed to generate comment',
        this.isRetryableError(error),
        'openai',
        error
      );
    }
  }

  async classifyCommentOpportunity(
    context: CommentOpportunityContext
  ): Promise<CommentClassificationResult> {
    try {
      const systemPrompt = this.createClassificationSystemPrompt();
      const userPrompt = this.createClassificationUserPrompt(context);

      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 50,
        temperature: 0.3, // より決定的な分類のため低温度
        response_format: { type: 'json_object' },
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No response from OpenAI');
      }

      let result: any;
      try {
        result = JSON.parse(choice.message.content || '{}');
      } catch {
        this.logger?.warn('Failed to parse classification response', { content: choice.message.content });
        return {
          classification: 'hold',
          confidence: 0.5,
        };
      }

      // 有効な分類値かチェック
      const validClassifications: CommentClassification[] = ['necessary', 'unnecessary', 'hold'];
      const classification = validClassifications.includes(result.classification)
        ? result.classification
        : 'hold';

      if (classification !== result.classification) {
        this.logger?.warn('Invalid classification received', { received: result.classification });
      }

      return {
        classification,
        confidence: result.confidence ?? 0.7,
        reason: result.reasoning,
      };
    } catch (error: any) {
      this.logger?.error('OpenAI classification error', error);
      throw new LLMError(
        'Failed to classify comment opportunity',
        this.isRetryableError(error),
        'openai',
        error
      );
    }
  }

  async chat(messages: LLMMessage[], options?: Record<string, unknown>): Promise<ChatResult> {
    try {
      const isStreaming = options?.stream === true;

      if (isStreaming) {
        return await this.handleStreamingChat(messages, options);
      }

      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: messages as any,
        max_tokens: (options?.maxTokens as number) || this.config.maxTokens,
        temperature: (options?.temperature as number) || this.config.temperature,
        ...options,
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No response from OpenAI');
      }

      return {
        message: {
          role: choice.message.role as 'assistant',
          content: choice.message.content || '',
        },
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error: any) {
      this.logger?.error('OpenAI chat error', error);
      throw new LLMError(
        'Failed to complete chat',
        this.isRetryableError(error),
        'openai',
        error
      );
    }
  }

  private async handleStreamingChat(
    messages: LLMMessage[],
    options?: Record<string, unknown>
  ): Promise<ChatResult> {
    const stream = await this.openai.chat.completions.create({
      model: this.config.model!,
      messages: messages as any,
      max_tokens: (options?.maxTokens as number) || this.config.maxTokens,
      temperature: (options?.temperature as number) || this.config.temperature,
      stream: true,
      ...options,
    });

    let content = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        content += delta.content;
      }
    }

    return {
      message: {
        role: 'assistant',
        content,
      },
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      });
      return true;
    } catch (error: any) {
      this.logger?.error('OpenAI health check failed', error);
      return false;
    }
  }

  private createCommentSystemPrompt(context: CommentGenerationContext): string {
    const { policy } = context;
    return `あなたはライブ配信の視聴者として、配信にコメントを投稿する役割です。

以下の設定に従ってコメントを生成してください：
- 口調: ${policy.tone}
- キャラクター: ${policy.characterPersona}
- 文字数: ${policy.targetLength.min}〜${policy.targetLength.max}文字
- 推奨表現: ${policy.encouragedExpressions.join('、') || 'なし'}

必ずJSON形式で以下の構造で応答してください：
{
  "comment": "生成されたコメント",
  "confidence": 0.0〜1.0の信頼度スコア
}`;
  }

  private createCommentUserPrompt(context: CommentGenerationContext): string {
    const parts: string[] = [];

    if (context.streamTitle) {
      parts.push(`配信タイトル: ${context.streamTitle}`);
    }

    if (context.recentTopics.length > 0) {
      parts.push(`最近の話題: ${context.recentTopics.slice(0, 5).join('、')}`);
    }

    if (context.keywords.length > 0) {
      parts.push(`キーワード: ${context.keywords.slice(0, 10).join('、')}`);
    }

    parts.push('\n上記の情報を踏まえて、適切なコメントを生成してください。');

    return parts.join('\n');
  }

  private createClassificationSystemPrompt(): string {
    return `あなたはライブ配信でのコメント投稿タイミングを判定する専門家です。

配信の状況を分析し、今がコメントを投稿するのに適切なタイミングかを以下の3段階で分類してください：

- "necessary": コメントすべき良いタイミング（質問への回答、話題への参加など）
- "unnecessary": コメントを控えるべきタイミング（集中している、重要な話をしているなど）
- "hold": 判断を保留すべきタイミング（状況が不明確）

必ずJSON形式で以下の構造で応答してください：
{
  "classification": "necessary" | "unnecessary" | "hold",
  "confidence": 0.0〜1.0の信頼度スコア,
  "reasoning": "判定理由（オプション）"
}`;
  }

  private createClassificationUserPrompt(context: CommentOpportunityContext): string {
    const parts: string[] = [];

    parts.push(`現在の文字起こし: ${context.transcript}`);
    
    if (context.recentTopics.length > 0) {
      parts.push(`最近の話題: ${context.recentTopics.join('、')}`);
    }


    parts.push(`エンゲージメントレベル: ${(context.engagementLevel * 100).toFixed(0)}%`);

    parts.push('\n上記の情報から、今がコメントを投稿する適切なタイミングかを判定してください。');

    return parts.join('\n');
  }

  private isRetryableError(error: any): boolean {
    // HTTPステータスコードベースの判定
    if (error.status === 429) { // Rate limit
      return true;
    }
    if (error.status === 401 || error.status === 403) { // Authentication
      return false;
    }
    if (error.status >= 500) { // Server errors
      return true;
    }

    // ネットワークエラー
    if (error.code === 'ETIMEDOUT' || 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND') {
      return true;
    }

    return false;
  }
}
