/**
 * Tsumiki AITDD - Refactor Phase
 * タスク51: Moderationアダプタの統合テスト
 */

import { OpenAIModerationAdapter } from '../../src/adapters/openai-moderation';
import { FailoverManager } from '../../src/core/failover';
import { ModerationManager } from '../../src/core/moderation-manager';
import { 
  ModerationPort, 
  ModerationResult,
  ModerationCategory,
  ModerationError 
} from '../../src/ports/moderation';
import { Logger, LogLevel } from '../../src/logging/logger';
import { SafetyConfig } from '../../src/config/types';

describe('Moderation Adapters Integration', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = new Logger({
      level: LogLevel.ERROR,
      console: false,
    });
  });

  describe('OpenAI Moderation Adapter Tests', () => {
    test('OpenAIアダプタの基本動作', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping OpenAI moderation test: API key not set');
        return;
      }

      const adapter = new OpenAIModerationAdapter({
        apiKey,
        logger: mockLogger,
      });

      const testContents = [
        'おはようございます！今日も良い一日になりますように',
        'ゲームの敵を倒すのが楽しい',
        '料理のレシピを教えてください',
      ];

      for (const content of testContents) {
        const result = await adapter.moderate(content);
        
        expect(result).toMatchObject({
          flagged: expect.any(Boolean),
          scores: {
            hate: expect.any(Number),
            harassment: expect.any(Number),
            selfHarm: expect.any(Number),
            sexual: expect.any(Number),
            violence: expect.any(Number),
            illegal: expect.any(Number),
            graphic: expect.any(Number),
          },
          flaggedCategories: expect.any(Array),
          suggestedAction: expect.stringMatching(/^(approve|review|block|rewrite)$/),
        });

        // スコアは0-1の範囲
        Object.values(result.scores).forEach(score => {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        });
      }
    });

    test('バッチモデレーションの動作確認', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping batch moderation test: API key not set');
        return;
      }

      const adapter = new OpenAIModerationAdapter({
        apiKey,
        logger: mockLogger,
      });

      const contents = [
        'こんにちは',
        'よろしくお願いします',
        'ありがとうございます',
        '素晴らしい配信ですね',
        'また見に来ます',
      ];

      const results = await adapter.moderateBatch(contents);
      
      expect(results).toHaveLength(contents.length);
      results.forEach((result, index) => {
        expect(result.flagged).toBe(false); // 安全なコンテンツのはず
        expect(result.suggestedAction).toBe('approve');
      });
    });
  });

  describe('Moderation Manager Integration', () => {
    test('モデレーションマネージャーとの統合', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping moderation manager test: API key not set');
        return;
      }

      const adapter = new OpenAIModerationAdapter({
        apiKey,
        logger: mockLogger,
      });

      const safetyConfig: SafetyConfig = {
        enabled: true,
        level: 'standard',
        moderationThresholds: {
          hate: 0.7,
          harassment: 0.7,
          selfHarm: 0.8,
          sexual: 0.8,
          violence: 0.6,
          illegal: 0.9,
          graphic: 0.8,
        },
        blockOnUncertainty: false,
      };

      const manager = new ModerationManager({
        primary: adapter,
        fallback: adapter, // 同じアダプタを使用
        config: safetyConfig,
      });

      const testContent = 'これは普通のコメントです';
      const result = await manager.moderateWithThresholds(testContent);

      expect(result).toMatchObject({
        flagged: expect.any(Boolean),
        scores: expect.any(Object),
        flaggedCategories: expect.any(Array),
        suggestedAction: expect.any(String),
      });

      // 統計情報の確認
      const stats = manager.getStatistics();
      expect(stats.totalRequests).toBe(1);
      expect(stats.flaggedCount).toBe(result.flagged ? 1 : 0);
    });
  });

  describe('Failover Mechanism', () => {
    test('フェイルオーバーが正しく動作すること', async () => {
      // モックアダプタ
      const failingAdapter: ModerationPort = {
        moderate: jest.fn().mockRejectedValue(
          new ModerationError('Service unavailable', true, 'primary')
        ),
        moderateBatch: jest.fn(),
        rewriteContent: jest.fn(),
        isHealthy: jest.fn().mockResolvedValue(false),
      };

      const successAdapter: ModerationPort = {
        moderate: jest.fn().mockResolvedValue({
          flagged: false,
          scores: {
            hate: 0.1,
            harassment: 0.1,
            selfHarm: 0,
            sexual: 0,
            violence: 0.1,
            illegal: 0,
            graphic: 0,
          },
          flaggedCategories: [],
          suggestedAction: 'approve',
        }),
        moderateBatch: jest.fn(),
        rewriteContent: jest.fn(),
        isHealthy: jest.fn().mockResolvedValue(true),
      };

      const failoverManager = new FailoverManager<ModerationPort>(
        [failingAdapter, successAdapter],
        {
          maxRetries: 3,
          retryDelayMs: 100,
          healthCheckIntervalMs: 30000,
        }
      );

      const result = await failoverManager.execute(
        provider => provider.moderate('テストコンテンツ')
      );

      expect(result.flagged).toBe(false);
      expect(result.suggestedAction).toBe('approve');
      expect(failingAdapter.moderate).toHaveBeenCalledTimes(1);
      expect(successAdapter.moderate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Content Rewriting', () => {
    test('コンテンツの書き換え機能', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping rewrite test: API key not set');
        return;
      }

      const adapter = new OpenAIModerationAdapter({
        apiKey,
        model: 'gpt-4o-mini',
        logger: mockLogger,
      });

      const guidelines = 'ポジティブで友好的な表現に書き換えてください。攻撃的な表現は避けてください。';
      
      const testCases = [
        {
          content: 'これは素晴らしい配信です！',
          expectRewrite: false,
        },
        {
          content: '面白くない内容だ',
          expectRewrite: true,
        },
      ];

      for (const testCase of testCases) {
        const result = await adapter.rewriteContent(
          testCase.content,
          guidelines
        );

        expect(result.original).toBe(testCase.content);
        if (testCase.expectRewrite) {
          // 書き換えが期待される場合
          expect(result.wasRewritten).toBe(true);
          expect(result.rewritten).not.toBe(testCase.content);
        } else {
          // 書き換えが期待されない場合
          // APIの判断によるので、必ずしもfalseとは限らない
          expect(result.rewritten).toBeDefined();
        }
      }
    });
  });

  describe('Performance and Rate Limiting', () => {
    test('レート制限の処理', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping rate limit test: API key not set');
        return;
      }

      const adapter = new OpenAIModerationAdapter({
        apiKey,
        logger: mockLogger,
      });

      // 並列リクエスト
      const requests = Array(5).fill(0).map((_, i) => 
        adapter.moderate(`テストコンテンツ ${i}`)
      );

      const results = await Promise.allSettled(requests);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      // 少なくとも1つは成功すべき
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Category Detection', () => {
    test('カテゴリ検出の精度確認', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping category detection test: API key not set');
        return;
      }

      const adapter = new OpenAIModerationAdapter({
        apiKey,
        logger: mockLogger,
      });

      // 注意: 実際のモデレーションAPIをテストする際は
      // 適切なテストデータを使用する必要があります
      const safeContent = '今日は良い天気ですね';
      const result = await adapter.moderate(safeContent);

      expect(result.flagged).toBe(false);
      expect(result.flaggedCategories).toHaveLength(0);
      expect(result.suggestedAction).toBe('approve');

      // すべてのスコアが低いことを確認
      Object.values(result.scores).forEach(score => {
        expect(score).toBeLessThan(0.5);
      });
    });
  });
});
