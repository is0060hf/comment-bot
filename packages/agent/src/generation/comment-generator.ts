/**
 * コメント生成モジュール
 * コンテキストとトリガーに基づいてコメントを生成
 */

import { ContextSummary, GeneratedComment, TriggerDecision } from '@comment-bot/shared';

import { CommentConfig } from '../config/types';
import { LLMPort } from '../ports/llm';

export interface GeneratorConfig {
  llm: LLMPort;
  commentConfig: CommentConfig;
  maxRetries: number;
  temperature: number;
  enableFallback?: boolean;
}

interface CacheEntry {
  key: string;
  comment: GeneratedComment;
  timestamp: number;
}

export class CommentGenerator {
  private config: GeneratorConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 30000; // 30秒

  constructor(config: GeneratorConfig) {
    this.config = config;
  }

  async generate(
    context: ContextSummary,
    triggerType: TriggerDecision['triggerType']
  ): Promise<GeneratedComment> {
    // キャッシュチェック
    const cacheKey = this.getCacheKey(context, triggerType);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.comment;
    }

    let retries = 0;
    let lastError: Error | undefined;

    while (retries < this.config.maxRetries) {
      try {
        const comment = await this.generateWithLLM(context, triggerType);
        
        // ポリシー適用
        const processed = this.applyPolicies(comment);
        
        // キャッシュ保存
        this.cache.set(cacheKey, {
          key: cacheKey,
          comment: processed,
          timestamp: Date.now(),
        });

        return processed;
      } catch (error) {
        lastError = error as Error;
        retries++;
        
        if (retries < this.config.maxRetries) {
          // エクスポネンシャルバックオフ
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
        }
      }
    }

    // フォールバック
    if (this.config.enableFallback) {
      return this.generateFallback(context, triggerType);
    }

    throw new Error(`Failed to generate comment after ${retries} retries: ${lastError?.message}`);
  }

  private async generateWithLLM(
    context: ContextSummary,
    triggerType: TriggerDecision['triggerType']
  ): Promise<GeneratedComment> {
    const result = await this.config.llm.generateComment({
      recentTopics: context.topics,
      keywords: context.keywords,
      streamTitle: '', // 実際は設定から取得
      policy: {
        tone: this.config.commentConfig.tone,
        characterPersona: this.config.commentConfig.characterPersona,
        encouragedExpressions: this.config.commentConfig.encouragedExpressions,
        targetLength: this.config.commentConfig.targetLength,
      },
    });

    const intent = this.inferIntent(triggerType);
    
    return {
      text: result.comment,
      metadata: {
        tone: this.config.commentConfig.tone,
        intent,
        confidence: result.confidence,
        generatedAt: new Date(),
      },
      alternatives: [],
    };
  }

  private applyPolicies(comment: GeneratedComment): GeneratedComment {
    let processedText = comment.text;

    // コメント長調整
    processedText = this.adjustLength(processedText);

    // NGワード除去
    processedText = this.removeNGWords(processedText);

    // 絵文字ポリシー適用
    processedText = this.applyEmojiPolicy(processedText);

    return {
      ...comment,
      text: processedText,
    };
  }

  private adjustLength(text: string): string {
    const { min, max } = this.config.commentConfig.targetLength;
    
    if (text.length < min) {
      // 短すぎる場合は拡張
      const fillers = this.config.commentConfig.encouragedExpressions;
      const filler = fillers[Math.floor(Math.random() * fillers.length)] || 'ですね';
      const extended = `${text}、${filler}！`;
      
      // まだ短い場合はさらに追加
      if (extended.length < min) {
        return `${extended}とても勉強になります！`;
      }
      return extended;
    }
    
    if (text.length > max) {
      // 長すぎる場合は切り詰め
      return `${text.substring(0, max - 1)}…`;
    }
    
    return text;
  }

  private removeNGWords(text: string): string {
    const ngWords = this.config.commentConfig.ngWords;
    let processed = text;
    
    ngWords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      processed = processed.replace(regex, '***');
    });
    
    return processed;
  }

  private applyEmojiPolicy(text: string): string {
    const { enabled, maxCount, allowedEmojis } = this.config.commentConfig.emojiPolicy;
    
    if (!enabled) {
      // 絵文字を削除
      return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
    }
    
    // 許可された絵文字のみ残す
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojis = text.match(emojiRegex) || [];
    
    let processedText = text;
    let emojiCount = 0;
    
    emojis.forEach(emoji => {
      if (!allowedEmojis.includes(emoji) || emojiCount >= maxCount) {
        processedText = processedText.replace(emoji, '');
      } else {
        emojiCount++;
      }
    });
    
    return processedText;
  }

  private generateFallback(
    context: ContextSummary,
    triggerType: TriggerDecision['triggerType']
  ): GeneratedComment {
    const fallbackTemplates: Record<string, string[]> = {
      question: [
        'なるほど、勉強になります！',
        'とても興味深いです！',
        '参考になります！',
      ],
      topic_change: [
        'おお、次も楽しみです！',
        '新しい話題ですね！',
        'これも面白そうです！',
      ],
      call_to_action: [
        '応援してます！',
        'いつも楽しく見てます！',
        '頑張ってください！',
      ],
      timing: [
        '集中して聞いてます！',
        'なるほど〜',
        '勉強になります！',
      ],
      manual: [
        'いいですね！',
        'すごい！',
        'なるほど！',
      ],
      none: [''],
    };

    const templates = fallbackTemplates[triggerType] || fallbackTemplates.manual || [];
    const text = templates[Math.floor(Math.random() * templates.length)] || '';

    // ポリシー適用
    const processed = this.adjustLength(text);
    const safeText = this.removeNGWords(processed);
    const finalText = this.applyEmojiPolicy(safeText);

    return {
      text: finalText,
      metadata: {
        tone: this.config.commentConfig.tone,
        intent: this.inferIntent(triggerType),
        confidence: 0.3,
        generatedAt: new Date(),
      },
      alternatives: [],
    };
  }

  private inferIntent(triggerType: TriggerDecision['triggerType']): string {
    const intentMap: Record<string, string> = {
      question: 'question',
      topic_change: 'interest',
      call_to_action: 'support',
      timing: 'engagement',
      manual: 'general',
      none: 'none',
    };
    
    return intentMap[triggerType] || 'general';
  }

  private getCacheKey(context: ContextSummary, triggerType: string): string {
    const topics = context.topics.slice(0, 3).join(',');
    const keywords = context.keywords.slice(0, 5).join(',');
    return `${triggerType}:${topics}:${keywords}`;
  }

  updateConfig(config: GeneratorConfig): void {
    this.config = config;
    this.cache.clear(); // 設定変更時はキャッシュをクリア
  }
}
