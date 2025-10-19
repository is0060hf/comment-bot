/**
 * Tsumiki AITDD - Green Phase
 * タスク51: OpenAI Moderationアダプタ実装
 */

import {
  ModerationPort,
  ModerationResult,
  ModerationCategory,
  RewriteResult,
  ModerationError,
} from '../ports/moderation';
import OpenAI from 'openai';
import { Logger } from '../logging/logger';

export interface OpenAIModerationConfig {
  apiKey: string;
  model?: string;
  logger?: Logger;
}

export class OpenAIModerationAdapter implements ModerationPort {
  private openai: OpenAI;
  private config: OpenAIModerationConfig;
  private logger?: Logger;

  constructor(config: OpenAIModerationConfig) {
    this.config = {
      model: 'gpt-4o-mini',
      ...config,
    };
    this.logger = config.logger;
    this.openai = new OpenAI({ apiKey: config.apiKey });
  }

  async moderate(content: string, _context?: string): Promise<ModerationResult> {
    try {
      const response = await this.openai.moderations.create({
        input: content,
      });

      const result = response.results[0];
      if (!result) {
        throw new Error('No moderation result returned');
      }

      // カテゴリスコアをマッピング
      const scores = this.mapCategoryScores(result.category_scores);
      const flaggedCategories = this.getFlaggedCategories(result);

      // アクションを決定
      const suggestedAction = this.determineSuggestedAction(
        result.flagged,
        flaggedCategories,
        scores
      );

      return {
        flagged: result.flagged,
        scores,
        flaggedCategories,
        suggestedAction,
      };
    } catch (error: any) {
      this.logger?.error('OpenAI moderation error', error);
      throw new ModerationError(
        'Failed to moderate content',
        this.isRetryableError(error),
        'openai',
        error
      );
    }
  }

  async moderateBatch(contents: string[]): Promise<ModerationResult[]> {
    if (contents.length === 0) {
      return [];
    }

    try {
      const response = await this.openai.moderations.create({
        input: contents,
      });

      return response.results.map((result, _index) => {
        const scores = this.mapCategoryScores(result.category_scores);
        const flaggedCategories = this.getFlaggedCategories(result);
        const suggestedAction = this.determineSuggestedAction(
          result.flagged,
          flaggedCategories,
          scores
        );

        return {
          flagged: result.flagged,
          scores,
          flaggedCategories,
          suggestedAction,
        };
      });
    } catch (error: any) {
      this.logger?.error('OpenAI batch moderation error', error);
      throw new ModerationError(
        'Failed to moderate batch content',
        this.isRetryableError(error),
        'openai',
        error
      );
    }
  }

  async rewriteContent(
    content: string,
    guidelines: string,
    context?: string
  ): Promise<RewriteResult> {
    try {
      const systemPrompt = `あなたはコンテンツモデレーターです。
以下のガイドラインに従って、不適切な内容を適切に書き換えてください：
${guidelines}

必ずJSON形式で以下の構造で応答してください：
{
  "rewritten": "書き換えたテキスト",
  "explanation": "変更理由"
}`;

      const userPrompt = context
        ? `コンテキスト: ${context}\n\n書き換え対象: ${content}`
        : `書き換え対象: ${content}`;

      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.3,
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
        // JSONパースに失敗した場合は、プレーンテキストとして扱う
        result = {
          rewritten: choice.message.content || content,
        };
      }

      const rewritten = result.rewritten || content;
      const wasRewritten = rewritten !== content;

      return {
        original: content,
        rewritten,
        wasRewritten,
      };
    } catch (error: any) {
      this.logger?.error('OpenAI rewrite error', error);
      throw new ModerationError(
        'Failed to rewrite content',
        this.isRetryableError(error),
        'openai',
        error
      );
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.openai.moderations.create({
        input: 'health check',
      });
      return true;
    } catch (error: any) {
      this.logger?.error('OpenAI moderation health check failed', error);
      return false;
    }
  }

  private mapCategoryScores(categoryScores: any): ModerationResult['scores'] {
    return {
      hate: categoryScores.hate || 0,
      harassment: categoryScores.harassment || 0,
      selfHarm: categoryScores['self-harm'] || 0,
      sexual: categoryScores.sexual || 0,
      violence: categoryScores.violence || 0,
      illegal: 0, // OpenAI APIでは提供されない
      graphic: categoryScores['violence/graphic'] || 0,
    };
  }

  private getFlaggedCategories(result: any): ModerationCategory[] {
    const flaggedCategories: ModerationCategory[] = [];

    if (result.categories.hate) {
      flaggedCategories.push(ModerationCategory.HATE);
    }
    if (result.categories.harassment || result.categories['harassment/threatening']) {
      flaggedCategories.push(ModerationCategory.HARASSMENT);
    }
    if (result.categories['self-harm'] || 
        result.categories['self-harm/intent'] || 
        result.categories['self-harm/instructions']) {
      flaggedCategories.push(ModerationCategory.SELF_HARM);
    }
    if (result.categories.sexual || result.categories['sexual/minors']) {
      flaggedCategories.push(ModerationCategory.SEXUAL);
    }
    if (result.categories.violence) {
      flaggedCategories.push(ModerationCategory.VIOLENCE);
    }
    if (result.categories['violence/graphic']) {
      flaggedCategories.push(ModerationCategory.GRAPHIC);
    }
    // ILLEGAL カテゴリはOpenAI APIでは直接提供されない

    return flaggedCategories;
  }

  private determineSuggestedAction(
    flagged: boolean,
    flaggedCategories: ModerationCategory[],
    scores: ModerationResult['scores']
  ): 'approve' | 'review' | 'block' | 'rewrite' {
    if (!flagged) {
      return 'approve';
    }

    // 重大なカテゴリがフラグされている場合
    const severeCategories = [
      ModerationCategory.SEXUAL,
      ModerationCategory.SELF_HARM,
      ModerationCategory.HATE,
    ];

    if (flaggedCategories.some(cat => severeCategories.includes(cat))) {
      return 'block';
    }

    // スコアが高い場合
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore > 0.8) {
      return 'block';
    }

    // 中程度のスコアの場合
    if (maxScore > 0.5) {
      return 'rewrite';
    }

    return 'review';
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
