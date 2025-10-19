/**
 * Tsumiki AITDD - Refactor Phase
 * タスク50: LLMアダプタの統合テスト
 */

import { OpenAILLMAdapter } from '../../src/adapters/openai-llm';
import { FailoverManager } from '../../src/core/failover';
import { 
  LLMPort, 
  CommentGenerationContext,
  CommentOpportunityContext,
  LLMMessage,
  LLMError 
} from '../../src/ports/llm';
import { Logger, LogLevel } from '../../src/logging/logger';

describe('LLM Adapters Integration', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = new Logger({
      level: LogLevel.ERROR,
      console: false,
    });
  });

  describe('OpenAI Adapter Tests', () => {
    test('OpenAIアダプタの基本動作', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping OpenAI test: API key not set');
        return;
      }

      const adapter = new OpenAILLMAdapter({
        apiKey,
        model: 'gpt-4o-mini',
        maxTokens: 100,
        temperature: 0.7,
        logger: mockLogger,
      });

      const context: CommentGenerationContext = {
        recentTopics: ['テスト', '統合テスト'],
        keywords: ['LLM', 'OpenAI'],
        streamTitle: '統合テスト配信',
        policy: {
          tone: 'friendly',
          characterPersona: 'テスト用の親切な視聴者',
          targetLength: {
            min: 20,
            max: 100,
          },
          encouragedExpressions: ['がんばって'],
        },
      };

      const result = await adapter.generateComment(context);

      expect(result).toMatchObject({
        comment: expect.any(String),
        confidence: expect.any(Number),
      });
      expect(result.comment.length).toBeGreaterThan(0);
      expect(result.comment.length).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    test('分類機能の動作確認', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping classification test: API key not set');
        return;
      }

      const adapter = new OpenAILLMAdapter({
        apiKey,
        model: 'gpt-4o-mini',
        logger: mockLogger,
      });

      const contexts: CommentOpportunityContext[] = [
        {
          transcript: '視聴者の皆さん、何か質問はありますか？',
          recentTopics: ['質問タイム'],
          engagementLevel: 0.8,
        },
        {
          transcript: '今は集中して作業をしているので、少し静かにしていてください',
          recentTopics: ['作業', '集中'],
          engagementLevel: 0.2,
        },
        {
          transcript: '普通の雑談をしています',
          recentTopics: ['雑談'],
          engagementLevel: 0.5,
        },
      ];

      for (const context of contexts) {
        const result = await adapter.classifyCommentOpportunity(context);
        
        expect(result).toMatchObject({
          classification: expect.stringMatching(/^(necessary|unnecessary|hold)$/),
          confidence: expect.any(Number),
        });
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Failover Manager with LLM Adapters', () => {
    test('フェイルオーバーが正しく動作すること', async () => {
      // モックアダプタ
      const failingAdapter: LLMPort = {
        generateComment: jest.fn().mockRejectedValue(
          new LLMError('Service unavailable', true, 'primary')
        ),
        classifyCommentOpportunity: jest.fn(),
        chat: jest.fn(),
        isHealthy: jest.fn().mockResolvedValue(false),
      };

      const successAdapter: LLMPort = {
        generateComment: jest.fn().mockResolvedValue({
          comment: 'バックアップアダプタからのコメント',
          confidence: 0.85,
        }),
        classifyCommentOpportunity: jest.fn(),
        chat: jest.fn(),
        isHealthy: jest.fn().mockResolvedValue(true),
      };

      const failoverManager = new FailoverManager<LLMPort>(
        [failingAdapter, successAdapter],
        {
          maxRetries: 3,
          retryDelayMs: 1000,
          healthCheckIntervalMs: 30000,
        }
      );

      const context: CommentGenerationContext = {
        recentTopics: ['テスト'],
        keywords: [],
        streamTitle: 'フェイルオーバーテスト',
        policy: {
          tone: 'neutral',
          characterPersona: '一般的な視聴者',
          targetLength: { min: 20, max: 100 },
          encouragedExpressions: [],
        },
      };

      const result = await failoverManager.execute(
        provider => provider.generateComment(context)
      );

      expect(result.comment).toBe('バックアップアダプタからのコメント');
      expect(failingAdapter.generateComment).toHaveBeenCalledTimes(1);
      expect(successAdapter.generateComment).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance and Rate Limiting', () => {
    test('レート制限の処理', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping rate limit test: API key not set');
        return;
      }

      const adapter = new OpenAILLMAdapter({
        apiKey,
        model: 'gpt-4o-mini',
        maxTokens: 10, // 小さなトークン数
        logger: mockLogger,
      });

      // レート制限をシミュレートするための高速リクエスト
      const requests = Array(3).fill(0).map(() => {
        const context: CommentGenerationContext = {
          recentTopics: ['テスト'],
          keywords: [],
          streamTitle: 'レート制限テスト',
          policy: {
            tone: 'friendly',
            characterPersona: 'テスト視聴者',
            targetLength: { min: 10, max: 50 },
            encouragedExpressions: [],
          },
        };
        return adapter.generateComment(context);
      });

      const results = await Promise.allSettled(requests);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      // 少なくとも1つは成功すべき
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Token Usage and Cost Management', () => {
    test('トークン使用量の追跡', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping token tracking test: API key not set');
        return;
      }

      const tokenLogger = new Logger({
        level: LogLevel.DEBUG,
        console: false,
      });

      const debugSpy = jest.spyOn(tokenLogger, 'debug');

      const adapter = new OpenAILLMAdapter({
        apiKey,
        model: 'gpt-4o-mini',
        maxTokens: 50,
        logger: tokenLogger,
      });

      const context: CommentGenerationContext = {
        recentTopics: ['トークンテスト'],
        keywords: [],
        streamTitle: 'トークン使用量追跡',
        policy: {
          tone: 'neutral',
          characterPersona: 'シンプルな視聴者',
          targetLength: { min: 10, max: 30 },
          encouragedExpressions: [],
        },
      };

      await adapter.generateComment(context);

      expect(debugSpy).toHaveBeenCalledWith(
        'OpenAI token usage',
        expect.objectContaining({
          prompt_tokens: expect.any(Number),
          completion_tokens: expect.any(Number),
          total_tokens: expect.any(Number),
        })
      );

      debugSpy.mockRestore();
    });
  });

  describe('Context Handling', () => {
    test('長いコンテキストの処理', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping long context test: API key not set');
        return;
      }

      const adapter = new OpenAILLMAdapter({
        apiKey,
        model: 'gpt-4o-mini',
        maxTokens: 50,
        logger: mockLogger,
      });

      const longContext: CommentGenerationContext = {
        recentTopics: Array(100).fill('トピック'),
        keywords: Array(50).fill('キーワード'),
        streamTitle: '非常に長いタイトルの配信'.repeat(10),
        policy: {
          tone: 'friendly',
          characterPersona: '詳細なキャラクター設定を持つ視聴者で、長い説明文があります',
          targetLength: { min: 20, max: 100 },
          encouragedExpressions: Array(20).fill('表現'),
        },
      };

      const result = await adapter.generateComment(longContext);

      expect(result.comment).toBeDefined();
      expect(result.comment.length).toBeGreaterThan(0);
    });
  });
});
