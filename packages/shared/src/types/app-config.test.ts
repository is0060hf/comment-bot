/**
 * Tsumiki AITDD - Red Phase
 * タスク44: 共有型定義のテストケース
 */

import {
  AppConfigSchema,
  TranscriptSegmentSchema,
  ContextSummarySchema,
  CommentGenerationContextSchema,
  CommentClassificationResultSchema,
  ModerationResultSchema,
  PostResultSchema,
  CommentTone,
} from './app-config';

describe('Shared Type Definitions', () => {
  describe('AppConfigSchema', () => {
    test('最小限の設定で検証が通ること', () => {
      const minimalConfig = {};
      const result = AppConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.providers).toBeDefined();
        expect(result.data.comment).toBeDefined();
        expect(result.data.safety).toBeDefined();
      }
    });

    test('完全な設定で検証が通ること', () => {
      const fullConfig = {
        providers: {
          stt: {
            primary: 'deepgram',
            fallback: ['gcp', 'whisper'],
            deepgram: {
              apiKey: 'test-key',
              model: 'nova-2',
              language: 'ja',
            },
          },
          llm: {
            primary: 'openai',
            openai: {
              apiKey: 'test-key',
              model: 'gpt-4o-mini',
            },
          },
          moderation: {
            primary: 'openai',
            fallback: ['rule_based'],
          },
        },
        comment: {
          targetLength: { min: 20, max: 60 },
          tone: 'friendly' as CommentTone,
          characterPersona: '好奇心旺盛な初心者',
          encouragedExpressions: ['なるほど', 'すごい'],
          ngWords: ['バカ', '死ね'],
          emojiPolicy: {
            enabled: true,
            maxCount: 1,
            allowedEmojis: ['👏', '✨'],
          },
        },
        safety: {
          enabled: true,
          level: 'standard',
          blockOnUncertainty: true,
          moderationThresholds: {
            hate: 0.7,
            harassment: 0.7,
          },
        },
        youtube: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token',
          rateLimits: {
            messagesPerMinute: 20,
            messagesPerHour: 200,
          },
        },
        stream: {
          audioDevice: 'BlackHole 2ch',
          bufferSize: 1024,
        },
      };

      const result = AppConfigSchema.safeParse(fullConfig);
      expect(result.success).toBe(true);
    });
  });

  describe('TranscriptSegmentSchema', () => {
    test('音声認識結果の検証が通ること', () => {
      const segment = {
        text: 'こんにちは',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      };

      const result = TranscriptSegmentSchema.safeParse(segment);
      expect(result.success).toBe(true);
    });
  });

  describe('ContextSummarySchema', () => {
    test('コンテキストサマリーの検証が通ること', () => {
      const summary = {
        recentTranscripts: ['こんにちは', 'よろしく'],
        topics: ['挨拶', '自己紹介'],
        keywords: ['初心者', 'プログラミング'],
        engagementLevel: 0.8,
        lastCommentTime: Date.now(),
      };

      const result = ContextSummarySchema.safeParse(summary);
      expect(result.success).toBe(true);
    });
  });

  describe('CommentGenerationContextSchema', () => {
    test('コメント生成コンテキストの検証が通ること', () => {
      const context = {
        currentTranscript: '今日はReactについて話します',
        recentTranscripts: ['こんにちは'],
        recentTopics: ['React', 'フロントエンド'],
        keywords: ['React', 'コンポーネント'],
        recentComments: ['なるほど！'],
        streamTitle: 'React入門',
        streamContext: {
          title: 'React入門',
          description: 'Reactの基礎を学ぶ',
        },
        policy: {
          targetLength: { min: 20, max: 60 },
          tone: 'friendly' as CommentTone,
          characterPersona: '初心者',
          encouragedExpressions: ['なるほど'],
        },
      };

      const result = CommentGenerationContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });
  });

  describe('CommentClassificationResultSchema', () => {
    test('コメント分類結果の検証が通ること', () => {
      const classification = {
        classification: 'necessary' as const,
        confidence: 0.85,
        reasons: ['質問が投げかけられている', '話題が転換した'],
        suggestedDelay: 3,
      };

      const result = CommentClassificationResultSchema.safeParse(classification);
      expect(result.success).toBe(true);
    });
  });

  describe('ModerationResultSchema', () => {
    test('モデレーション結果の検証が通ること', () => {
      const moderation = {
        flagged: false,
        categories: {
          hate: false,
          harassment: false,
        },
        scores: {
          hate: 0.1,
          harassment: 0.05,
        },
        requiresRewrite: false,
        suggestedAction: 'pass' as const,
      };

      const result = ModerationResultSchema.safeParse(moderation);
      expect(result.success).toBe(true);
    });
  });

  describe('PostResultSchema', () => {
    test('投稿結果の検証が通ること', () => {
      const postResult = {
        success: true,
        messageId: 'msg-123',
        timestamp: Date.now(),
        comment: 'なるほど！勉強になります',
      };

      const result = PostResultSchema.safeParse(postResult);
      expect(result.success).toBe(true);
    });

    test('エラー時の投稿結果の検証が通ること', () => {
      const errorResult = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'レート制限を超えました',
          retryAfter: 60,
        },
      };

      const result = PostResultSchema.safeParse(errorResult);
      expect(result.success).toBe(true);
    });
  });
});
