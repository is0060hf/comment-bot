/**
 * Tsumiki AITDD - Red Phase
 * タスク1: 共有型定義のテストケース
 */

import { z } from 'zod';
import { 
  TranscriptSegmentSchema,
  ContextSummarySchema,
  TriggerDecisionSchema,
  GeneratedCommentSchema,
  ModerationResultSchema,
  PostResultSchema,
  type TranscriptSegment,
  type ContextSummary,
  type TriggerDecision,
  type GeneratedComment,
  type ModerationResult,
  type PostResult
} from './shared-types';

describe('Shared Types', () => {
  describe('TranscriptSegment', () => {
    test('有効なTranscriptSegmentを検証できること', () => {
      const segment: TranscriptSegment = {
        text: 'こんにちは、今日は良い天気ですね',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        speaker: 'host',
        language: 'ja'
      };

      const result = TranscriptSegmentSchema.parse(segment);
      expect(result).toEqual(segment);
    });

    test('必須フィールドが不足している場合はエラーになること', () => {
      const invalidSegment = {
        text: 'こんにちは',
        timestamp: Date.now(),
        confidence: 0.95,
        // isFinalが不足
      };

      expect(() => TranscriptSegmentSchema.parse(invalidSegment)).toThrow();
    });
  });

  describe('ContextSummary', () => {
    test('有効なContextSummaryを検証できること', () => {
      const context: ContextSummary = {
        recentTranscripts: ['こんにちは', '今日はプログラミングの話をします'],
        topics: ['ゲーム', 'プログラミング', '配信設定'],
        keywords: ['Unity', 'C#', 'OBS'],
        engagementLevel: 0.8,
        lastCommentTime: Date.now(),
        viewerQuestions: ['どうやってゲームを作るの？']
      };

      const result = ContextSummarySchema.parse(context);
      expect(result).toEqual(context);
    });

    test('必須フィールドが不足している場合はエラーになること', () => {
      const invalidContext = {
        recentTranscripts: [],
        topics: [],
        // keywordsが不足
        engagementLevel: 0.5
      };

      expect(() => ContextSummarySchema.parse(invalidContext)).toThrow();
    });
  });

  describe('TriggerDecision', () => {
    test('有効なTriggerDecisionを検証できること', () => {
      const decision: TriggerDecision = {
        shouldComment: true,
        reason: 'question_asked',
        confidence: 0.85,
        triggerType: 'question',
        context: {
          recentTranscript: '質問がある方はコメントでどうぞ',
          detectedIntent: 'seeking_interaction'
        }
      };

      const result = TriggerDecisionSchema.parse(decision);
      expect(result).toEqual(decision);
    });

    test('shouldCommentがfalseの場合もreasonが必要', () => {
      const decision: TriggerDecision = {
        shouldComment: false,
        reason: 'too_soon',
        confidence: 0.3,
        triggerType: 'none'
      };

      const result = TriggerDecisionSchema.parse(decision);
      expect(result.shouldComment).toBe(false);
    });
  });

  describe('GeneratedComment', () => {
    test('有効なGeneratedCommentを検証できること', () => {
      const comment: GeneratedComment = {
        text: 'なるほど！とても勉強になります',
        metadata: {
          tone: 'friendly',
          intent: 'appreciation',
          confidence: 0.9,
          generatedAt: new Date()
        },
        alternatives: [
          '勉強になります！',
          'すごく参考になりました'
        ]
      };

      const result = GeneratedCommentSchema.parse(comment);
      expect(result).toEqual(comment);
    });

    test('alternativesが空配列でも有効', () => {
      const comment: GeneratedComment = {
        text: 'ありがとうございます',
        metadata: {
          tone: 'grateful',
          intent: 'thanks',
          confidence: 0.95,
          generatedAt: new Date()
        },
        alternatives: []
      };

      const result = GeneratedCommentSchema.parse(comment);
      expect(result.alternatives).toEqual([]);
    });
  });

  describe('ModerationResult', () => {
    test('安全なコンテンツの場合', () => {
      const result: ModerationResult = {
        flagged: false,
        categories: {},
        scores: {},
        requiresRewrite: false,
        suggestedAction: 'pass'
      };

      const parsed = ModerationResultSchema.parse(result);
      expect(parsed.flagged).toBe(false);
    });

    test('フラグされたコンテンツの場合', () => {
      const result: ModerationResult = {
        flagged: true,
        categories: { harassment: true, hate: true },
        scores: { harassment: 0.87, hate: 0.65 },
        requiresRewrite: true,
        suggestedAction: 'block',
        error: 'Detected potentially harassing language'
      };

      const parsed = ModerationResultSchema.parse(result);
      expect(parsed.categories.harassment).toBe(true);
    });
  });

  describe('PostResult', () => {
    test('成功した投稿の場合', () => {
      const result: PostResult = {
        success: true,
        messageId: 'abc123',
        timestamp: Date.now(),
        comment: 'なるほど！勉強になります'
      };

      const parsed = PostResultSchema.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.messageId).toBe('abc123');
    });

    test('失敗した投稿の場合', () => {
      const result: PostResult = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          retryAfter: 60
        }
      };

      const parsed = PostResultSchema.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Type Exports', () => {
    test('すべての型がエクスポートされていること', () => {
      // TypeScriptの型システムでチェックされるため、
      // このテストは型がインポートできることを確認
      const segment: TranscriptSegment = {
        text: 'test',
        timestamp: Date.now(),
        confidence: 1,
        isFinal: true
      };
      const context: ContextSummary = {
        recentTranscripts: [],
        topics: [],
        keywords: [],
        engagementLevel: 0.5
      };
      const trigger: TriggerDecision = {
        shouldComment: true,
        reason: 'test',
        confidence: 0.5,
        triggerType: 'manual'
      };
      const comment: GeneratedComment = {
        text: 'test',
        metadata: {
          tone: 'neutral',
          intent: 'test',
          confidence: 0.5,
          generatedAt: new Date()
        },
        alternatives: []
      };
      const moderation: ModerationResult = {
        flagged: false,
        categories: {},
        scores: {},
        suggestedAction: 'pass'
      };
      const post: PostResult = {
        success: true,
        messageId: 'test',
        timestamp: Date.now()
      };

      expect(segment).toBeDefined();
      expect(context).toBeDefined();
      expect(trigger).toBeDefined();
      expect(comment).toBeDefined();
      expect(moderation).toBeDefined();
      expect(post).toBeDefined();
    });
  });

  describe('Additional Types', () => {
    test('ApiResponse型が正しく動作すること', () => {
      const ApiResponseSchema = z.object({
        success: z.boolean(),
        data: z.unknown().optional(),
        error: z.object({
          code: z.string(),
          message: z.string(),
          details: z.unknown().optional(),
        }).optional(),
      });

      const successResponse = {
        success: true,
        data: { message: 'Hello' }
      };

      const errorResponse = {
        success: false,
        error: {
          code: 'ERROR_CODE',
          message: 'Something went wrong'
        }
      };

      expect(ApiResponseSchema.parse(successResponse)).toEqual(successResponse);
      expect(ApiResponseSchema.parse(errorResponse)).toEqual(errorResponse);
    });

    test('WebSocketMessage型が正しく動作すること', () => {
      const WebSocketMessageSchema = z.object({
        type: z.enum(['status', 'transcript', 'comment', 'error', 'config_update']),
        payload: z.unknown(),
        timestamp: z.date(),
      });

      const message = {
        type: 'transcript',
        payload: { text: 'Hello world' },
        timestamp: new Date()
      };

      const parsed = WebSocketMessageSchema.parse(message);
      expect(parsed.type).toBe('transcript');
    });

    test('AgentStatus型が正しく動作すること', () => {
      const AgentStatusSchema = z.object({
        running: z.boolean(),
        paused: z.boolean(),
        liveChatId: z.string().optional(),
        startedAt: z.date().optional(),
        statistics: z.object({
          transcriptsProcessed: z.number(),
          commentsGenerated: z.number(),
          commentsPosted: z.number(),
          errorsCount: z.number(),
        }).optional(),
      });

      const status = {
        running: true,
        paused: false,
        liveChatId: 'abc123',
        startedAt: new Date(),
        statistics: {
          transcriptsProcessed: 100,
          commentsGenerated: 20,
          commentsPosted: 18,
          errorsCount: 2
        }
      };

      const parsed = AgentStatusSchema.parse(status);
      expect(parsed.running).toBe(true);
      expect(parsed.statistics?.commentsPosted).toBe(18);
    });
  });
});
