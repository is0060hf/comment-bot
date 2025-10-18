/**
 * トリガー検出モジュール
 * コンテキストを分析してコメントタイミングを判定
 */

import { ContextSummary, TriggerDecision } from '@comment-bot/shared';
import { LLMPort } from '../ports/llm';

export interface TriggerConfig {
  llm: LLMPort;
  minInterval: number;
  maxInterval: number;
  rules: {
    questionTrigger: boolean;
    topicChangeTrigger: boolean;
    callToActionTrigger: boolean;
    silenceTrigger: boolean;
    silenceThresholdMs: number;
  };
  confidence: {
    ruleBasedThreshold: number;
    llmThreshold: number;
  };
}

interface TriggerHistoryEntry {
  decision: TriggerDecision;
  timestamp: number;
}

export class TriggerDetector {
  private config: TriggerConfig;
  private lastCommentTime = 0;
  private history: TriggerHistoryEntry[] = [];

  constructor(config: TriggerConfig) {
    this.config = config;
  }

  async evaluate(context: ContextSummary): Promise<TriggerDecision> {
    // インターバルチェック
    const timeSinceLastComment = Date.now() - this.lastCommentTime;
    
    if (timeSinceLastComment < this.config.minInterval) {
      return {
        shouldComment: false,
        reason: 'too soon since last comment',
        confidence: 1.0,
        triggerType: 'none',
      };
    }

    // ルールベースの検出を先に実行
    const ruleBasedDecision = this.evaluateRules(context, timeSinceLastComment);

    // 最大インターバルのチェックは他の検出の後で
    if (!ruleBasedDecision.shouldComment && timeSinceLastComment >= this.config.maxInterval) {
      const maxIntervalDecision = {
        shouldComment: true,
        reason: 'max interval exceeded',
        confidence: 1.0,
        triggerType: 'timing' as const,
        context: {
          recentTranscript: context.recentTranscripts.join(' '),
          detectedIntent: 'keep_engagement',
        },
      };
      this.recordDecision(maxIntervalDecision);
      return maxIntervalDecision;
    }

    // 同じトリガータイプの連続を防ぐ
    if (ruleBasedDecision.shouldComment && this.isSameTriggerAsLast(ruleBasedDecision.triggerType)) {
      const sameTypeDecision = {
        shouldComment: false,
        reason: 'same trigger type as previous',
        confidence: 0.5,
        triggerType: 'none' as const,
      };
      return sameTypeDecision;
    }

    // LLMによる検証（必要な場合）
    if (ruleBasedDecision.confidence >= this.config.confidence.ruleBasedThreshold) {
      if (ruleBasedDecision.shouldComment) {
        this.recordDecision(ruleBasedDecision);
      }
      return ruleBasedDecision;
    }

    try {
      const llmDecision = await this.evaluateWithLLM(context);
      
      if (llmDecision.confidence >= this.config.confidence.llmThreshold) {
        if (llmDecision.shouldComment) {
          this.recordDecision(llmDecision);
        }
        return llmDecision;
      }
    } catch (error) {
      console.error('LLM evaluation failed, falling back to rule-based:', error);
    }

    // フォールバック
    if (ruleBasedDecision.shouldComment) {
      this.recordDecision(ruleBasedDecision);
    }
    return ruleBasedDecision;
  }

  private evaluateRules(context: ContextSummary, timeSinceLastComment: number): TriggerDecision {
    const transcripts = context.recentTranscripts.join(' ').toLowerCase();

    // 質問の検出
    if (this.config.rules.questionTrigger) {
      const questionPatterns = [
        /質問[はが]?あり/,
        /どう思い?ます/,
        /コメント.*お待ち/,
        /意見.*聞かせ/,
        /みなさん.*どう/,
      ];

      for (const pattern of questionPatterns) {
        if (pattern.test(transcripts)) {
          return {
            shouldComment: true,
            reason: 'question detected',
            confidence: 0.8,
            triggerType: 'question',
            context: {
              recentTranscript: context.recentTranscripts.slice(-2).join(' '),
              detectedIntent: 'answer_question',
            },
          };
        }
      }
    }

    // 話題転換の検出
    if (this.config.rules.topicChangeTrigger) {
      const topicChangePatterns = [
        /次は|では|さて|それでは/,
        /話を?変えて|別の話/,
        /今度は|続いて/,
      ];

      for (const pattern of topicChangePatterns) {
        if (pattern.test(transcripts) && context.topics.length > 1) {
          return {
            shouldComment: true,
            reason: 'topic change detected',
            confidence: 0.75,
            triggerType: 'topic_change',
            context: {
              recentTranscript: context.recentTranscripts.slice(-2).join(' '),
              detectedIntent: 'show_interest',
            },
          };
        }
      }
    }

    // コールトゥアクションの検出
    if (this.config.rules.callToActionTrigger) {
      const ctaPatterns = [
        /チャンネル登録/,
        /高評価|いいね/,
        /フォロー.*お願い/,
        /シェア.*して/,
        /通知.*オン/,
        /登録.*お願い/,
      ];

      for (const pattern of ctaPatterns) {
        if (pattern.test(transcripts)) {
          return {
            shouldComment: true,
            reason: 'call to action detected',
            confidence: 0.85,
            triggerType: 'call_to_action',
            context: {
              recentTranscript: context.recentTranscripts.slice(-1).join(' '),
              detectedIntent: 'support',
            },
          };
        }
      }
    }

    // 沈黙の検出
    if (this.config.rules.silenceTrigger && timeSinceLastComment > this.config.rules.silenceThresholdMs) {
      return {
        shouldComment: true,
        reason: 'silence detected',
        confidence: 0.7,
        triggerType: 'timing',
        context: {
          recentTranscript: context.recentTranscripts.slice(-1).join(' '),
          detectedIntent: 'maintain_engagement',
        },
      };
    }

    return {
      shouldComment: false,
      reason: 'no trigger detected',
      confidence: 0.3,
      triggerType: 'none',
    };
  }

  private async evaluateWithLLM(context: ContextSummary): Promise<TriggerDecision> {
    const result = await this.config.llm.classifyCommentOpportunity({
      transcript: context.recentTranscripts.join(' '),
      recentTopics: context.topics,
      engagementLevel: context.engagementLevel,
    });

    const shouldComment = result && result.classification === 'necessary';
    
    return {
      shouldComment,
      reason: shouldComment ? (result.reason || 'LLM classified as necessary') : 'LLM classified as unnecessary',
      confidence: result?.confidence || 0.5,
      triggerType: this.inferTriggerType(result?.reason || ''),
      context: shouldComment ? {
        recentTranscript: context.recentTranscripts.slice(-2).join(' '),
        detectedIntent: 'llm_suggested',
      } : undefined,
    };
  }

  private inferTriggerType(reason: string): TriggerDecision['triggerType'] {
    const reasonLower = reason.toLowerCase();
    
    if (reasonLower.includes('question')) return 'question';
    if (reasonLower.includes('topic')) return 'topic_change';
    if (reasonLower.includes('action') || reasonLower.includes('subscribe')) return 'call_to_action';
    if (reasonLower.includes('silence') || reasonLower.includes('timing')) return 'timing';
    
    return 'manual';
  }

  private isSameTriggerAsLast(triggerType: TriggerDecision['triggerType']): boolean {
    if (this.history.length === 0) return false;
    
    const lastEntry = this.history[this.history.length - 1];
    if (!lastEntry) return false;
    
    return lastEntry.decision.triggerType === triggerType && 
           lastEntry.decision.shouldComment;
  }

  private recordDecision(decision: TriggerDecision): void {
    this.history.push({
      decision,
      timestamp: Date.now(),
    });

    // 履歴を最新100件に制限
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }
  }

  setLastCommentTime(time: number): void {
    this.lastCommentTime = time;
  }

  getHistory(): TriggerDecision[] {
    return this.history.map(entry => entry.decision);
  }

  updateConfig(config: TriggerConfig): void {
    this.config = config;
  }
}
