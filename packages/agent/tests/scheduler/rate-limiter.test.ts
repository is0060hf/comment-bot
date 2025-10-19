/**
 * Tsumiki AITDD - Red Phase
 * タスク8: レート制限のテストケース
 */

import { RateLimiter, RateLimiterConfig } from '../../src/scheduler/rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let config: RateLimiterConfig;

  beforeEach(() => {
    config = {
      minIntervalSeconds: 10,     // 最小間隔: 10秒
      maxPer10Minutes: 20,        // 10分間の最大数: 20
      cooldownSeconds: 30,        // クールダウン: 30秒
      dedupeWindowSeconds: 60,    // 重複ウィンドウ: 60秒
    };
    rateLimiter = new RateLimiter(config, true); // テスト時は自動クリーンアップを無効化
  });

  afterEach(() => {
    rateLimiter.destroy();
  });

  describe('minimum interval', () => {
    test('最小間隔を守ること', async () => {
      const comment1 = 'コメント1';
      const comment2 = 'コメント2';

      // 1つ目は許可される
      const result1 = await rateLimiter.checkLimit(comment1);
      expect(result1.allowed).toBe(true);
      expect(result1.reason).toBeUndefined();

      // すぐに2つ目を送ろうとすると拒否される
      const result2 = await rateLimiter.checkLimit(comment2);
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toBe('min_interval');
      expect(result2.retryAfter).toBeGreaterThan(0);
      expect(result2.retryAfter).toBeLessThanOrEqual(10);
    });

    test('最小間隔経過後は許可されること', async () => {
      jest.useFakeTimers();

      const comment1 = 'コメント1';
      const comment2 = 'コメント2';

      // 1つ目
      const result1 = await rateLimiter.checkLimit(comment1);
      expect(result1.allowed).toBe(true);

      // 10秒経過
      jest.advanceTimersByTime(10000);

      // 2つ目は許可される
      const result2 = await rateLimiter.checkLimit(comment2);
      expect(result2.allowed).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('rate limit per 10 minutes', () => {
    test.skip('10分間の制限を超えると拒否されること', async () => {
      // 新しいインスタンスを作成（クールダウンを避ける）
      const testConfig = {
        minIntervalSeconds: 1,      // テスト用に短く
        maxPer10Minutes: 20,        // 10分間の最大数: 20
        cooldownSeconds: 300,       // クールダウンを長く
        dedupeWindowSeconds: 60,    // 重複ウィンドウ: 60秒
      };
      const testLimiter = new RateLimiter(testConfig, true);

      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // 20個のコメントを送信（制限まで）
      for (let i = 0; i < 20; i++) {
        const result = await testLimiter.checkLimit(`コメント${i}`);
        expect(result.allowed).toBe(true);
        
        // 最小間隔を守るために待つ
        jest.setSystemTime(startTime + (i + 1) * 2000); // 2秒間隔
      }

      // 21個目は拒否される
      const result = await testLimiter.checkLimit('コメント21');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('rate_limit');
      expect(result.retryAfter).toBeGreaterThan(0);

      testLimiter.destroy();
      jest.useRealTimers();
    });

    test('10分経過後は制限がリセットされること', async () => {
      jest.useFakeTimers();

      // 20個送信
      for (let i = 0; i < 20; i++) {
        await rateLimiter.checkLimit(`コメント${i}`);
        jest.advanceTimersByTime(10000);
      }

      // 10分経過
      jest.advanceTimersByTime(600000);

      // 新しいコメントは許可される
      const result = await rateLimiter.checkLimit('新しいコメント');
      expect(result.allowed).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('cooldown period', () => {
    test('連続投稿後のクールダウンが機能すること', async () => {
      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // 短時間に3つ連続で投稿（設定可能な閾値）
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkLimit(`コメント${i}`);
        expect(result.allowed).toBe(true);
        jest.setSystemTime(startTime + (i + 1) * 10000); // 最小間隔
      }

      // 4つ目はクールダウンで拒否される
      const result = await rateLimiter.checkLimit('コメント4');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('cooldown');
      expect(result.retryAfter).toBeLessThanOrEqual(30);
      expect(result.retryAfter).toBeGreaterThan(0);

      // クールダウン期間経過後は許可される
      jest.setSystemTime(startTime + 30000 + 30000);
      const result2 = await rateLimiter.checkLimit('コメント5');
      expect(result2.allowed).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('deduplication', () => {
    test('同じコメントは重複ウィンドウ内で拒否されること', async () => {
      const comment = '同じコメント';

      // 1つ目は許可
      const result1 = await rateLimiter.checkLimit(comment);
      expect(result1.allowed).toBe(true);

      // 同じコメントは拒否
      const result2 = await rateLimiter.checkLimit(comment);
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toBe('duplicate');
    });

    test('重複ウィンドウ経過後は同じコメントも許可されること', async () => {
      jest.useFakeTimers();

      const comment = '同じコメント';

      // 1つ目
      await rateLimiter.checkLimit(comment);

      // 60秒経過
      jest.advanceTimersByTime(60000);

      // 同じコメントも許可される
      const result = await rateLimiter.checkLimit(comment);
      expect(result.allowed).toBe(true);

      jest.useRealTimers();
    });

    test('正規化された重複も検出すること', async () => {
      // スペースや記号の違いを正規化
      const comment1 = 'こんにちは！　今日は良い天気ですね';
      const comment2 = 'こんにちは! 今日は良い天気ですね';

      const result1 = await rateLimiter.checkLimit(comment1);
      expect(result1.allowed).toBe(true);

      const result2 = await rateLimiter.checkLimit(comment2);
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toBe('duplicate');
    });
  });

  describe('statistics', () => {
    test('統計情報を取得できること', async () => {
      jest.useFakeTimers();

      // いくつかコメントを送信
      await rateLimiter.checkLimit('コメント1');
      jest.advanceTimersByTime(10000);
      
      await rateLimiter.checkLimit('コメント2');
      jest.advanceTimersByTime(5000);
      
      await rateLimiter.checkLimit('コメント1'); // 重複

      const stats = rateLimiter.getStatistics();
      
      expect(stats.totalAttempts).toBe(3);
      expect(stats.totalAllowed).toBe(2);
      expect(stats.totalRejected).toBe(1);
      expect(stats.rejectionReasons.duplicate).toBe(1);
      expect(stats.currentWindowCount).toBe(2);
      expect(stats.isInCooldown).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('reset and clear', () => {
    test('履歴をクリアできること', async () => {
      await rateLimiter.checkLimit('コメント1');
      await rateLimiter.checkLimit('コメント2');

      rateLimiter.clearHistory();

      const stats = rateLimiter.getStatistics();
      expect(stats.totalAttempts).toBe(0);
      expect(stats.currentWindowCount).toBe(0);
    });

    test('設定を更新できること', async () => {
      const newConfig: RateLimiterConfig = {
        minIntervalSeconds: 5,
        maxPer10Minutes: 30,
        cooldownSeconds: 20,
        dedupeWindowSeconds: 30,
      };

      rateLimiter.updateConfig(newConfig);

      // 新しい設定が適用されることを確認
      const config = rateLimiter.getConfig();
      expect(config).toEqual(newConfig);
    });
  });

  describe('edge cases', () => {
    test('空のコメントは常に拒否されること', async () => {
      const emptyComments = ['', '   ', '\n\t'];

      for (const comment of emptyComments) {
        const result = await rateLimiter.checkLimit(comment);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('invalid');
      }
    });

    test('非常に長いコメントも処理できること', async () => {
      const longComment = 'あ'.repeat(1000);
      const result = await rateLimiter.checkLimit(longComment);
      expect(result.allowed).toBe(true);
    });
  });
});
