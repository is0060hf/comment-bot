/**
 * コメント生成器
 * LLMを使用してコメントを生成
 */

import { LLMPort, CommentGenerationContext } from '../ports/llm';
import { CommentConfig } from '../config/types';
import { CommentLengthPolicy } from '../policies/comment-length';
import { NGWordsPolicy } from '../policies/ng-words';
import { EmojiPolicy } from '../policies/emoji';
import { Logger, LogLevel } from '../logging/logger';

export interface CommentGeneratorConfig {
  llmAdapter: LLMPort;
  commentConfig: CommentConfig;
}

export interface GeneratedCommentResult {
  comment: string;
  confidence: number;
  isTemplate: boolean;
  wasAdjusted: boolean;
  adjustmentReason?: string;
  reasoning?: string;
}

export class CommentGenerator {
  private llmAdapter: LLMPort;
  private config: CommentConfig;
  private lengthPolicy: CommentLengthPolicy;
  private ngWordsPolicy: NGWordsPolicy;
  private emojiPolicy: EmojiPolicy;
  private recentComments: string[] = [];
  private readonly maxRecentComments = 10;
  private logger: Logger;

  constructor({ llmAdapter, commentConfig }: CommentGeneratorConfig) {
    this.llmAdapter = llmAdapter;
    this.config = commentConfig;
    this.lengthPolicy = new CommentLengthPolicy(commentConfig);
    this.ngWordsPolicy = new NGWordsPolicy(commentConfig);
    this.emojiPolicy = new EmojiPolicy(commentConfig);
    this.logger = new Logger({ level: LogLevel.INFO });
  }

  /**
   * コメントを生成
   */
  async generate(context: CommentGenerationContext): Promise<GeneratedCommentResult> {
    try {
      // LLMでコメント生成
      const llmResult = await this.llmAdapter.generateComment({
        ...context,
        policy: {
          tone: this.config.tone,
          targetLength: this.config.targetLength,
          characterPersona: this.config.characterPersona,
          encouragedExpressions: this.config.encouragedExpressions,
        }
      });

      // ポリシー適用
      let adjustedComment = llmResult.comment;
      let wasAdjusted = false;
      const adjustmentReasons: string[] = [];

      // NGワード除去
      const ngResult = this.ngWordsPolicy.validate(adjustedComment);
      if (!ngResult.isValid) {
        adjustedComment = this.ngWordsPolicy.sanitize(adjustedComment);
        wasAdjusted = true;
        adjustmentReasons.push('ng_words_removed');
      }

      // 絵文字処理
      if (this.config.emojiPolicy.enabled) {
        const emojiResult = this.emojiPolicy.validate(adjustedComment);
        if (!emojiResult.isValid) {
          adjustedComment = this.emojiPolicy.sanitize(adjustedComment);
          wasAdjusted = true;
          adjustmentReasons.push('emoji_adjusted');
        }
      } else {
        // 絵文字を除去
        adjustedComment = this.emojiPolicy.sanitize(adjustedComment);
        wasAdjusted = true;
        adjustmentReasons.push('emoji_removed');
      }

      // 文字数調整
      const isValidLength = this.lengthPolicy.validate(adjustedComment);
      if (!isValidLength) {
        const originalLength = adjustedComment.length;
        adjustedComment = this.lengthPolicy.adjust(adjustedComment);
        wasAdjusted = true;
        adjustmentReasons.push(originalLength < this.config.targetLength.min ? 'extended' : 'truncated');
      }

      // 文字数調整後に短すぎる場合は再生成
      if (adjustedComment.length < this.config.targetLength.min) {
        this.logger.info('Comment too short after adjustments, regenerating');
        return this.generate(context);
      }

      // 最近使用したコメントとの重複チェック
      if (this.isDuplicate(adjustedComment)) {
        this.logger.info('Duplicate comment detected, regenerating');
        return this.generate(context);
      }

      // コメントを記録
      this.recordUsedComment(adjustedComment);

      return {
        comment: adjustedComment,
        confidence: llmResult.confidence,
        isTemplate: false,
        wasAdjusted,
        adjustmentReason: adjustmentReasons.join(', '),
        reasoning: undefined
      };

    } catch (error) {
      this.logger.error('Failed to generate comment with LLM', error);
      // フォールバック：定型文から選択
      return this.selectTemplate(context);
    }
  }

  /**
   * 定型文から選択
   */
  private selectTemplate(context: CommentGenerationContext): GeneratedCommentResult {
    const templates = [
      'なるほど！',
      'いいですね！',
      'すごい！',
      '参考になります！',
      '確かにそうですね',
      '面白いです！'
    ];

    // コンテキストに基づいて適切なテンプレートを選択
    let selectedTemplate: string;
    
    if (context.recentTopics.some(t => t.includes('楽しい') || t.includes('いい'))) {
      const positiveTemplates = templates.filter(t => 
        t.includes('いい') || t.includes('すごい') || t.includes('！')
      );
      selectedTemplate = positiveTemplates[Math.floor(Math.random() * positiveTemplates.length)] || templates[0]!;
    } else if (context.recentTopics.some(t => t.includes('質問'))) {
      selectedTemplate = 'なるほど、確かにそうですね';
    } else {
      selectedTemplate = templates[Math.floor(Math.random() * templates.length)]!;
    }

    // 絵文字を追加
    if (this.config.emojiPolicy.enabled) {
      selectedTemplate = this.emojiPolicy.formatWithEmoji(selectedTemplate);
    }

    return {
      comment: selectedTemplate,
      confidence: 0.4,
      isTemplate: true,
      wasAdjusted: false
    };
  }

  /**
   * 重複チェック
   */
  private isDuplicate(comment: string): boolean {
    const normalized = comment.toLowerCase().replace(/[！？。、\s]/g, '');
    
    return this.recentComments.some(recent => {
      const normalizedRecent = recent.toLowerCase().replace(/[！？。、\s]/g, '');
      // 70%以上一致したら重複とみなす
      const similarity = this.calculateSimilarity(normalized, normalizedRecent);
      return similarity > 0.7;
    });
  }

  /**
   * 文字列の類似度を計算
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * レーベンシュタイン距離
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0]![j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1
          );
        }
      }
    }
    
    return matrix[str2.length]![str1.length]!;
  }

  /**
   * 使用したコメントを記録
   */
  recordUsedComment(comment: string): void {
    this.recentComments.push(comment);
    if (this.recentComments.length > this.maxRecentComments) {
      this.recentComments.shift();
    }
  }

  /**
   * 設定を更新
   */
  updateConfig(config: CommentConfig): void {
    this.config = config;
    this.lengthPolicy.updateConfig(config);
    this.ngWordsPolicy.updateConfig(config);
    this.emojiPolicy.updateConfig(config);
  }
}
