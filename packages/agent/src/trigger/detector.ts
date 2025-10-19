/**
 * トリガー検出器
 * コメント投稿のタイミングを判定
 */

import { ContextStore } from '../context/store';
import { LLMPort, CommentOpportunityContext, CommentClassification } from '../ports/llm';
import { Logger, LogLevel } from '../logging/logger';

export interface TriggerConfig {
  keywords: string[];
  minSilenceDuration: number;
  topicChangeThreshold: number;
  enableLLMClassification: boolean;
  minIntervalBetweenComments?: number;
}

export interface TriggerResult {
  shouldComment: boolean;
  confidence: number;
  reason?: string;
  llmClassification?: CommentClassification;
}

export interface TriggerDetectorConfig {
  contextStore: ContextStore;
  llmAdapter: LLMPort;
  triggerConfig: TriggerConfig;
}

export class TriggerDetector {
  private contextStore: ContextStore;
  private llmAdapter: LLMPort;
  private config: TriggerConfig;
  private lastCommentTime: number = 0;
  private recentTopics: string[] = [];
  private logger: Logger;

  constructor({ contextStore, llmAdapter, triggerConfig }: TriggerDetectorConfig) {
    this.contextStore = contextStore;
    this.llmAdapter = llmAdapter;
    this.config = {
      minIntervalBetweenComments: 60000, // デフォルト1分
      ...triggerConfig
    };
    this.logger = new Logger({ level: LogLevel.INFO });
  }

  /**
   * コメント機会を評価
   */
  async evaluateOpportunity(transcript: string): Promise<TriggerResult> {
    // 最近コメントしたかチェック
    if (this.isRecentlyCommented()) {
      return {
        shouldComment: false,
        confidence: 0,
        reason: 'recent_comment'
      };
    }

    // ルールベースの評価
    const ruleResult = this.evaluateRules(transcript);
    
    // LLMによる評価
    if (this.config.enableLLMClassification) {
      try {
        const context = this.buildContext();
        const classificationResult = await this.llmAdapter.classifyCommentOpportunity(context);
        const classification = classificationResult.classification;
        
        // 強いキーワードがある場合はLLMの判定を上書き
        if (ruleResult.confidence > 0.8 && classification === 'unnecessary') {
          return {
            ...ruleResult,
            shouldComment: true,
            reason: 'strong_keyword_override',
            llmClassification: classification
          };
        }

        // LLMの判定を優先
        if (classification === 'necessary') {
          return {
            shouldComment: true,
            confidence: classificationResult.confidence,
            reason: 'llm_classification',
            llmClassification: classification
          };
        }

        return {
          shouldComment: false,
          confidence: classificationResult.confidence,
          reason: 'llm_classification',
          llmClassification: classification
        };
      } catch (error) {
        this.logger.warn('LLM classification failed, falling back to rules', error);
        // LLMが失敗した場合はルールベースの結果を使用
      }
    }

    return ruleResult;
  }

  /**
   * 静寂を評価
   */
  async evaluateSilence(): Promise<TriggerResult> {
    const lastTranscript = this.contextStore.getLastTranscript();
    
    if (!lastTranscript) {
      return {
        shouldComment: false,
        confidence: 0,
        reason: 'no_context'
      };
    }

    const silenceDuration = Date.now() - lastTranscript.timestamp;
    
    if (silenceDuration >= this.config.minSilenceDuration) {
      return {
        shouldComment: true,
        confidence: 0.7,
        reason: 'silence_detected'
      };
    }

    return {
      shouldComment: false,
      confidence: 0,
      reason: 'insufficient_silence'
    };
  }

  /**
   * ルールベースの評価
   */
  evaluateRules(transcript: string): TriggerResult {
    const lowerTranscript = transcript.toLowerCase();
    let confidence = 0;
    const reasons: string[] = [];

    // キーワードチェック
    const matchedKeywords = this.config.keywords.filter(keyword => 
      lowerTranscript.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      confidence += 0.3 * matchedKeywords.length;
      reasons.push('keyword');
    }

    // 話題変化チェック
    if (this.detectTopicChange(transcript)) {
      confidence += 0.4;
      reasons.push('topic_change');
    }

    // 疑問文チェック
    if (transcript.includes('？') || transcript.includes('?')) {
      confidence += 0.2;
      reasons.push('question');
    }

    // 呼びかけチェック
    if (lowerTranscript.includes('コメント') || lowerTranscript.includes('意見')) {
      confidence += 0.3;
      reasons.push('call_to_action');
    }

    return {
      shouldComment: confidence >= 0.5,
      confidence: Math.min(confidence, 1.0),
      reason: reasons.join('_')
    };
  }

  /**
   * 話題変化を検出
   */
  private detectTopicChange(transcript: string): boolean {
    const currentTopics = this.extractTopics(transcript);
    
    if (this.recentTopics.length === 0) {
      this.recentTopics = currentTopics;
      return false;
    }

    // 話題の重複をチェック
    const overlap = currentTopics.filter(topic => 
      this.recentTopics.some(recent => 
        recent.toLowerCase().includes(topic.toLowerCase()) ||
        topic.toLowerCase().includes(recent.toLowerCase())
      )
    );

    const changeRatio = 1 - (overlap.length / Math.max(currentTopics.length, 1));
    
    if (changeRatio >= this.config.topicChangeThreshold) {
      this.recentTopics = currentTopics;
      return true;
    }

    return false;
  }

  /**
   * トピックを抽出（簡易版）
   */
  private extractTopics(text: string): string[] {
    // 名詞っぽい単語を抽出（簡易版）
    const words = text.split(/[、。！？\s]+/);
    return words.filter(word => word.length > 2);
  }

  /**
   * 最近コメントしたかチェック
   */
  private isRecentlyCommented(): boolean {
    if (this.lastCommentTime === 0) return false;
    
    const timeSinceLastComment = Date.now() - this.lastCommentTime;
    return timeSinceLastComment < this.config.minIntervalBetweenComments!;
  }

  /**
   * コメント投稿を記録
   */
  recordCommentPosted(timestamp: number = Date.now()): void {
    this.lastCommentTime = timestamp;
  }

  /**
   * LLM用のコンテキストを構築
   */
  buildContext(): CommentOpportunityContext {
    const summary = this.contextStore.getSummary();
    const lastTranscript = this.contextStore.getLastTranscript();
    
    return {
      transcript: lastTranscript?.text || '',
      recentTopics: summary.topics,
      engagementLevel: this.getEngagementLevel()
    };
  }

  /**
   * 数値化されたエンゲージメントレベル
   */
  private getEngagementLevel(): number {
    const level = this.estimateEngagement();
    switch (level) {
      case 'high': return 0.9;
      case 'medium': return 0.5;
      case 'low': return 0.2;
      default: return 0.5;
    }
  }

  /**
   * エンゲージメントレベルを推定
   */
  private estimateEngagement(): 'low' | 'medium' | 'high' {
    const recentTranscripts = this.contextStore.getRecentTranscripts(5);
    
    if (recentTranscripts.length === 0) return 'low';

    // 発話頻度でエンゲージメントを推定
    const timeSpan = Date.now() - recentTranscripts[0]!.timestamp;
    const frequency = recentTranscripts.length / (timeSpan / 60000); // 分あたり

    if (frequency > 2) return 'high';
    if (frequency > 0.5) return 'medium';
    return 'low';
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<TriggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
