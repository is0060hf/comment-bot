/**
 * コメントパイプライン
 * 音声認識からコメント投稿までの全体的な処理を管理
 */

import { CommentLengthPolicy } from '../policies/comment-length';
import { EmojiPolicy } from '../policies/emoji';
import { NGWordsPolicy } from '../policies/ng-words';
import { CommentClassificationPrompt } from '../prompts/comment-classification';
import { CommentGenerationPrompt } from '../prompts/comment-generation';

import { ModerationManager } from './moderation-manager';

import type { AppConfig } from '../config/types';
import type { LLMPort, CommentOpportunityContext, CommentGenerationContext } from '../ports/llm';
import type { STTPort } from '../ports/stt';
import type { YouTubePort } from '../ports/youtube';

/**
 * パイプライン設定
 */
export interface CommentPipelineConfig {
  config: AppConfig;
  sttAdapter: STTPort;
  llmAdapter: LLMPort;
  moderationManager: ModerationManager;
  youtubeAdapter: YouTubePort;
  lengthPolicy: CommentLengthPolicy;
  ngWordsPolicy: NGWordsPolicy;
  emojiPolicy: EmojiPolicy;
  generationPrompt: CommentGenerationPrompt;
  classificationPrompt: CommentClassificationPrompt;
}

/**
 * 処理結果
 */
export interface ProcessResult {
  success: boolean;
  transcript?: string;
  generatedComment?: string;
  posted: boolean;
  postId?: string;
  error?: string;
  timestamp: Date;
}

/**
 * コンテキスト情報
 */
export interface PipelineContext {
  recentTranscripts: string[];
  recentTopics: string[];
  recentComments: string[];
  lastCommentTime?: Date;
}

/**
 * コメントパイプラインクラス
 */
export class CommentPipeline {
  private config: AppConfig;
  private sttAdapter: STTPort;
  private llmAdapter: LLMPort;
  private moderationManager: ModerationManager;
  private youtubeAdapter: YouTubePort;
  private lengthPolicy: CommentLengthPolicy;
  private ngWordsPolicy: NGWordsPolicy;
  private emojiPolicy: EmojiPolicy;
  private generationPrompt: CommentGenerationPrompt;
  private classificationPrompt: CommentClassificationPrompt;

  private running = false;
  private liveChatId?: string;
  private context: PipelineContext = {
    recentTranscripts: [],
    recentTopics: [],
    recentComments: [],
  };

  constructor(pipelineConfig: CommentPipelineConfig) {
    this.config = pipelineConfig.config;
    this.sttAdapter = pipelineConfig.sttAdapter;
    this.llmAdapter = pipelineConfig.llmAdapter;
    this.moderationManager = pipelineConfig.moderationManager;
    this.youtubeAdapter = pipelineConfig.youtubeAdapter;
    this.lengthPolicy = pipelineConfig.lengthPolicy;
    this.ngWordsPolicy = pipelineConfig.ngWordsPolicy;
    this.emojiPolicy = pipelineConfig.emojiPolicy;
    this.generationPrompt = pipelineConfig.generationPrompt;
    this.classificationPrompt = pipelineConfig.classificationPrompt;
  }

  /**
   * パイプラインの開始
   */
  async start(liveChatId: string): Promise<void> {
    this.liveChatId = liveChatId;
    this.running = true;
    this.context = {
      recentTranscripts: [],
      recentTopics: [],
      recentComments: [],
    };
  }

  /**
   * パイプラインの停止
   */
  async stop(): Promise<void> {
    this.running = false;
    this.liveChatId = undefined;
  }

  /**
   * 実行状態の確認
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 音声データの処理
   */
  async processAudio(audioBuffer: Buffer): Promise<ProcessResult> {
    const timestamp = new Date();

    if (!this.running) {
      return {
        success: false,
        posted: false,
        error: 'Pipeline not running',
        timestamp,
      };
    }

    try {
      // 1. 音声認識
      const transcriptResult = await this.sttAdapter.transcribe(audioBuffer);
      const transcript = transcriptResult.transcript;

      // コンテキストに追加
      this.addToContext('transcript', transcript);

      // 2. コメント機会の評価
      const shouldComment = await this.evaluateCommentOpportunityInternal(transcript);

      if (!shouldComment) {
        return {
          success: true,
          transcript,
          posted: false,
          timestamp,
        };
      }

      // 3. レート制限チェック
      const rateLimitInfo = await this.youtubeAdapter.getRateLimitInfo();
      if (rateLimitInfo.remaining <= 0) {
        return {
          success: false,
          transcript,
          posted: false,
          error: 'YouTube API rate limit exceeded',
          timestamp,
        };
      }

      // 最小投稿間隔のチェック
      if (!this.checkMinInterval()) {
        return {
          success: true,
          transcript,
          posted: false,
          timestamp,
        };
      }

      // 4. コメント生成
      const generatedComment = await this.generateComment(transcript);

      // 5. ポリシー適用
      const policyAppliedComment = await this.applyPolicies(generatedComment);

      // 6. モデレーション
      const moderationResult =
        await this.moderationManager.moderateWithThresholds(policyAppliedComment);

      if (moderationResult.flagged && moderationResult.suggestedAction === 'block') {
        return {
          success: true,
          transcript,
          generatedComment: policyAppliedComment,
          posted: false,
          error: 'Comment blocked by moderation',
          timestamp,
        };
      }

      let finalComment = policyAppliedComment;
      if (moderationResult.suggestedAction === 'rewrite') {
        const rewriteResult = await this.moderationManager.moderateAndRewrite(policyAppliedComment);
        if (rewriteResult.rewritten && rewriteResult.rewrittenContent) {
          finalComment = rewriteResult.rewrittenContent;
        }
      }

      // 7. 投稿
      const postResult = await this.youtubeAdapter.postMessage(this.liveChatId!, finalComment);

      // コンテキストに追加
      this.addToContext('comment', finalComment);
      this.context.lastCommentTime = timestamp;

      return {
        success: true,
        transcript,
        generatedComment: finalComment,
        posted: true,
        postId: postResult.id,
        timestamp,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        posted: false,
        error: errorMessage.includes('STT') ? `STT failed: ${  errorMessage}` : errorMessage,
        timestamp,
      };
    }
  }

  /**
   * コメント機会の評価（外部公開用）
   */
  async evaluateCommentOpportunity(audioBuffer: Buffer): Promise<boolean> {
    try {
      const result = await this.sttAdapter.transcribe(audioBuffer);
      return await this.evaluateCommentOpportunityInternal(result.transcript);
    } catch {
      return false;
    }
  }

  /**
   * コメント機会の評価（内部用）
   */
  private async evaluateCommentOpportunityInternal(transcript: string): Promise<boolean> {
    const context: CommentOpportunityContext = {
      transcript,
      recentTopics: this.context.recentTopics,
      engagementLevel: 0.5, // モック値
    };

    const result = await this.llmAdapter.classifyCommentOpportunity(context);

    // necessaryの場合はtrue
    return result.classification === 'necessary';
  }

  /**
   * コメント生成
   */
  private async generateComment(_transcript: string): Promise<string> {
    const context: CommentGenerationContext = {
      recentTopics: this.context.recentTopics,
      keywords: [],
      streamTitle: '',
      policy: {
        tone: this.config.comment.tone,
        characterPersona: this.config.comment.characterPersona,
        encouragedExpressions: this.config.comment.encouragedExpressions,
        targetLength: this.config.comment.targetLength,
      },
    };

    const result = await this.llmAdapter.generateComment(context);
    return result.comment;
  }

  /**
   * ポリシーの適用
   */
  private async applyPolicies(comment: string): Promise<string> {
    let processedComment = comment;

    // NG語のサニタイズ
    processedComment = this.ngWordsPolicy.sanitize(processedComment);

    // 文字数調整
    processedComment = this.lengthPolicy.adjust(processedComment);

    // 絵文字の調整
    processedComment = this.emojiPolicy.sanitize(processedComment);

    return processedComment;
  }

  /**
   * 最小投稿間隔のチェック
   */
  private checkMinInterval(): boolean {
    if (!this.context.lastCommentTime) {
      return true;
    }

    const now = Date.now();
    const lastTime = this.context.lastCommentTime.getTime();
    const minInterval = this.config.rateLimit.minIntervalSeconds * 1000;

    return now - lastTime >= minInterval;
  }

  /**
   * コンテキストへの追加
   */
  private addToContext(type: 'transcript' | 'topic' | 'comment', content: string): void {
    const maxItems = 10;

    switch (type) {
      case 'transcript':
        this.context.recentTranscripts.unshift(content);
        if (this.context.recentTranscripts.length > maxItems) {
          this.context.recentTranscripts.pop();
        }
        // トピック抽出（簡易実装）
        if (content.includes('について') || content.includes('とは')) {
          this.context.recentTopics.unshift(content);
          if (this.context.recentTopics.length > maxItems) {
            this.context.recentTopics.pop();
          }
        }
        break;

      case 'topic':
        this.context.recentTopics.unshift(content);
        if (this.context.recentTopics.length > maxItems) {
          this.context.recentTopics.pop();
        }
        break;

      case 'comment':
        this.context.recentComments.unshift(content);
        if (this.context.recentComments.length > maxItems) {
          this.context.recentComments.pop();
        }
        break;
    }
  }

  /**
   * コンテキストの取得
   */
  getContext(): PipelineContext {
    return { ...this.context };
  }

  /**
   * 設定の更新
   */
  async updateConfig(newConfig: AppConfig): Promise<void> {
    this.config = newConfig;

    // 各ポリシーとプロンプトの設定を更新
    this.lengthPolicy.updateConfig(newConfig.comment);
    this.ngWordsPolicy.updateConfig(newConfig.comment);
    this.emojiPolicy.updateConfig(newConfig.comment);
    this.generationPrompt.updateConfig(newConfig.comment);
    this.classificationPrompt.updateConfig(newConfig.comment);
    this.moderationManager.updateConfig(newConfig.safety);
  }
}
