import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockModerationAdapter } from '../../../src/adapters/mocks/moderation';
import {
  ModerationPort,
  ModerationResult,
  ModerationError,
  ModerationCategory,
} from '../../../src/ports/moderation';

describe('MockModerationAdapter', () => {
  let adapter: MockModerationAdapter;

  beforeEach(() => {
    adapter = new MockModerationAdapter();
  });

  describe('moderate', () => {
    it('should approve safe content', async () => {
      const safeContent = '今日の配信とても勉強になりました！ありがとうございます。';

      const result = await adapter.moderate(safeContent);

      expect(result.flagged).toBe(false);
      expect(result.categories).toEqual({});
      expect(result.scores).toEqual({});
      expect(result.requiresRewrite).toBe(false);
    });

    it('should flag inappropriate content', async () => {
      const unsafeContent = 'これはテスト用の不適切なコンテンツです[暴力的表現]';

      const result = await adapter.moderate(unsafeContent);

      expect(result.flagged).toBe(true);
      expect(result.categories).toHaveProperty('violence');
      expect(result.categories.violence).toBe(true);
      expect(result.scores).toHaveProperty('violence');
      expect(result.scores.violence).toBeGreaterThan(0.7);
    });

    it('should suggest rewrite for mildly inappropriate content', async () => {
      const mildContent = 'ちょっと微妙な表現[軽度の不適切さ]';

      const result = await adapter.moderate(mildContent);

      expect(result.flagged).toBe(false);
      expect(result.requiresRewrite).toBe(true);
      expect(result.scores).toBeDefined();
    });

    it('should handle empty content', async () => {
      const result = await adapter.moderate('');

      expect(result.flagged).toBe(false);
      expect(result.categories).toEqual({});
      expect(result.scores).toEqual({});
    });

    it('should handle API failures', async () => {
      const failingAdapter = new MockModerationAdapter({ failureRate: 1.0 });

      await expect(failingAdapter.moderate('test')).rejects.toThrow(ModerationError);
    });
  });

  describe('moderateBatch', () => {
    it('should moderate multiple contents', async () => {
      const contents = ['安全なコメント1', '安全なコメント2', '不適切なコメント[暴力]'];

      const results = await adapter.moderateBatch(contents);

      expect(results).toHaveLength(3);
      expect(results[0]?.flagged).toBe(false);
      expect(results[1]?.flagged).toBe(false);
      expect(results[2]?.flagged).toBe(true);
    });

    it('should handle empty batch', async () => {
      const results = await adapter.moderateBatch([]);

      expect(results).toEqual([]);
    });
  });

  describe('rewriteContent', () => {
    it('should rewrite inappropriate content', async () => {
      const inappropriateContent = '[暴力的]な表現を含むコメント';

      const result = await adapter.rewriteContent(inappropriateContent);

      expect(result.rewritten).toBeTruthy();
      expect(result.rewritten).not.toBe(inappropriateContent);
      expect(result.rewritten).toContain('[適切な表現]');
      expect(result.changes).toBeGreaterThan(0);
    });

    it('should not change safe content', async () => {
      const safeContent = '完全に安全で適切なコメントです';

      const result = await adapter.rewriteContent(safeContent);

      expect(result.rewritten).toBe(safeContent);
      expect(result.changes).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('should return health status', async () => {
      const health = await adapter.isHealthy();
      expect(health).toBe(true);
    });

    it('should return false when configured unhealthy', async () => {
      const unhealthyAdapter = new MockModerationAdapter({ healthy: false });
      const health = await unhealthyAdapter.isHealthy();
      expect(health).toBe(false);
    });
  });
});
