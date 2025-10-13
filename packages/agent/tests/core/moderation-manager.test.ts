import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ModerationManager } from '../../src/core/moderation-manager';
import { ModerationPort, ModerationResult } from '../../src/ports/moderation';
import { MockModerationAdapter } from '../../src/adapters/mocks/moderation';
import { SafetyConfig } from '../../src/config/types';

describe('ModerationManager', () => {
  let manager: ModerationManager;
  let primaryAdapter: ModerationPort;
  let fallbackAdapter: ModerationPort;
  let config: SafetyConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      level: 'standard' as const,
      blockOnUncertainty: true,
      moderationThresholds: {
        hate: 0.7,
        harassment: 0.7,
        selfHarm: 0.8,
        sexual: 0.7,
        violence: 0.7,
        illegal: 0.8,
        graphic: 0.8
      }
    };

    primaryAdapter = new MockModerationAdapter({ shouldFail: false });
    fallbackAdapter = new MockModerationAdapter({ shouldFail: false });
    
    manager = new ModerationManager({
      primary: primaryAdapter,
      fallback: fallbackAdapter,
      config
    });
  });

  describe('threshold-based moderation', () => {
    it('should flag content exceeding thresholds', async () => {
      const content = 'これはテストコンテンツです';
      const result = await manager.moderateWithThresholds(content);
      
      expect(result).toBeDefined();
      expect(result.flagged).toBeDefined();
      expect(result.categories).toBeDefined();
      expect(result.scores).toBeDefined();
    });

    it('should use custom thresholds for different safety levels', async () => {
      // Low safety level - 高い閾値
      config.level = 'relaxed';
      manager.updateConfig(config);
      
      const thresholds = manager.getThresholds();
      expect(thresholds.hate).toBeGreaterThan(0.8);
      expect(thresholds.harassment).toBeGreaterThan(0.8);
      
      // High safety level - 低い閾値
      config.level = 'strict';
      manager.updateConfig(config);
      
      const strictThresholds = manager.getThresholds();
      expect(strictThresholds.hate).toBeLessThan(0.6);
      expect(strictThresholds.harassment).toBeLessThan(0.6);
    });

    it('should respect category-specific thresholds', async () => {
      const result = await manager.moderateWithThresholds('暴力的な内容');
      
      // カテゴリごとのスコアと閾値をチェック
      if (result.scores && result.flaggedCategories) {
        const thresholds = manager.getThresholds();
        
        for (const category of result.flaggedCategories) {
          const score = result.scores[category as keyof typeof result.scores];
          const threshold = thresholds[category as keyof typeof thresholds];
          
          expect(score).toBeGreaterThanOrEqual(threshold!);
        }
      }
    });
  });

  describe('fallback mechanism', () => {
    it('should use fallback when primary fails', async () => {
      const failingPrimary = new MockModerationAdapter({ shouldFail: true });
      manager = new ModerationManager({
        primary: failingPrimary,
        fallback: fallbackAdapter,
        config
      });
      
      const spy = jest.spyOn(fallbackAdapter, 'moderate');
      const content = 'テストコンテンツ';
      
      const result = await manager.moderateWithThresholds(content);
      
      expect(result).toBeDefined();
      expect(spy).toHaveBeenCalledWith(content, undefined);
    });

    it('should handle both adapters failing', async () => {
      const failingPrimary = new MockModerationAdapter({ shouldFail: true });
      const failingFallback = new MockModerationAdapter({ shouldFail: true });
      
      manager = new ModerationManager({
        primary: failingPrimary,
        fallback: failingFallback,
        config
      });
      
      const content = 'テストコンテンツ';
      const result = await manager.moderateWithThresholds(content);
      
      // blockOnUncertaintyがtrueの場合、エラー時はflagged: true
      expect(result.flagged).toBe(config.blockOnUncertainty);
      expect(result.error).toBeDefined();
    });

    it('should respect blockOnUncertainty setting', async () => {
      const failingPrimary = new MockModerationAdapter({ shouldFail: true });
      const failingFallback = new MockModerationAdapter({ shouldFail: true });
      
      // blockOnUncertainty = false
      config.blockOnUncertainty = false;
      manager = new ModerationManager({
        primary: failingPrimary,
        fallback: failingFallback,
        config
      });
      
      const result = await manager.moderateWithThresholds('テスト');
      expect(result.flagged).toBe(false);
      
      // blockOnUncertainty = true
      config.blockOnUncertainty = true;
      manager.updateConfig(config);
      
      const strictResult = await manager.moderateWithThresholds('テスト');
      expect(strictResult.flagged).toBe(true);
    });
  });

  describe('batch moderation', () => {
    it('should moderate multiple contents efficiently', async () => {
      const contents = [
        'これは安全なコンテンツです',
        '少し怪しいコンテンツ',
        '明らかに危険なコンテンツ'
      ];
      
      const results = await manager.moderateBatch(contents);
      
      expect(results).toHaveLength(contents.length);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.flagged).toBeDefined();
      });
    });

    it('should handle partial failures in batch', async () => {
      // 部分的に失敗するモックアダプタ
      const partialFailAdapter = new MockModerationAdapter({
        shouldFail: false,
        inappropriatePatterns: ['危険']
      });
      
      manager = new ModerationManager({
        primary: partialFailAdapter,
        fallback: fallbackAdapter,
        config
      });
      
      const contents = ['安全', '危険', '普通'];
      const results = await manager.moderateBatch(contents);
      
      expect(results).toHaveLength(3);
      expect(results[0]!.flagged).toBe(false);
      expect(results[1]!.flagged).toBe(true);
      expect(results[2]!.flagged).toBe(false);
    });
  });

  describe('content rewriting', () => {
    it('should attempt to rewrite flagged content', async () => {
      const inappropriateContent = 'これはバカみたいな内容です';
      
      const result = await manager.moderateAndRewrite(inappropriateContent);
      
      expect(result.originalFlagged).toBeDefined();
      if (result.rewritten) {
        expect(result.rewrittenContent).toBeDefined();
        expect(result.rewrittenContent).not.toContain('バカ');
        expect(result.rewrittenFlagged).toBeDefined();
      }
    });

    it('should skip rewriting if content is safe', async () => {
      const safeContent = 'これは安全で素晴らしい内容です';
      
      const result = await manager.moderateAndRewrite(safeContent);
      
      expect(result.originalFlagged).toBe(false);
      expect(result.rewritten).toBe(false);
      expect(result.rewrittenContent).toBeUndefined();
    });

    it('should provide guidelines for rewriting', async () => {
      const guidelines = [
        '丁寧な表現を使用してください',
        '攻撃的な言葉を避けてください'
      ];
      
      const content = '攻撃的な内容';
      const result = await manager.moderateAndRewrite(content, guidelines);
      
      if (result.rewritten && result.rewrittenContent) {
        // ガイドラインが考慮されているか（モックでは簡易的な確認）
        expect(result.rewrittenContent.length).toBeGreaterThan(0);
      }
    });
  });

  describe('threshold configuration', () => {
    it('should get default thresholds for each safety level', () => {
      const levels: Array<SafetyConfig['level']> = ['relaxed', 'standard', 'strict'];
      
      levels.forEach(level => {
        config.level = level;
        manager.updateConfig(config);
        
        const thresholds = manager.getThresholds();
        
        // すべてのカテゴリに閾値が設定されているか
        expect(thresholds.hate).toBeDefined();
        expect(thresholds.harassment).toBeDefined();
        expect(thresholds.sexual).toBeDefined();
        expect(thresholds.violence).toBeDefined();
        expect(thresholds.selfHarm).toBeDefined();
        expect(thresholds.illegal).toBeDefined();
        expect(thresholds.graphic).toBeDefined();
        
        // 閾値が0-1の範囲内か
        Object.values(thresholds).forEach(threshold => {
          if (threshold !== undefined) {
            expect(threshold).toBeGreaterThanOrEqual(0);
            expect(threshold).toBeLessThanOrEqual(1);
          }
        });
      });
    });

    it('should allow custom threshold overrides', () => {
      const customThresholds = {
        hate: 0.5,
        harassment: 0.5,
        sexual: 0.7,
        violence: 0.6
      };
      
      manager.setCustomThresholds(customThresholds);
      const thresholds = manager.getThresholds();
      
      expect(thresholds.hate).toBe(0.5);
      expect(thresholds.harassment).toBe(0.5);
      expect(thresholds.sexual).toBe(0.7);
      expect(thresholds.violence).toBe(0.6);
    });
  });

  describe('health monitoring', () => {
    it('should track adapter health status', async () => {
      const healthStatus = await manager.getHealthStatus();
      
      expect(healthStatus.primary).toBeDefined();
      expect(healthStatus.primary.healthy).toBe(true);
      expect(healthStatus.fallback).toBeDefined();
      expect(healthStatus.fallback.healthy).toBe(true);
    });

    it('should report unhealthy adapters', async () => {
      const unhealthyAdapter = new MockModerationAdapter({ 
        shouldFail: false,
        isHealthy: false 
      });
      
      manager = new ModerationManager({
        primary: unhealthyAdapter,
        fallback: fallbackAdapter,
        config
      });
      
      const healthStatus = await manager.getHealthStatus();
      
      expect(healthStatus.primary.healthy).toBe(false);
      expect(healthStatus.fallback.healthy).toBe(true);
    });
  });

  describe('statistics and monitoring', () => {
    it('should collect moderation statistics', async () => {
      // いくつかのコンテンツをモデレート
      await manager.moderateWithThresholds('安全なコンテンツ');
      await manager.moderateWithThresholds('危険なコンテンツ');
      await manager.moderateWithThresholds('普通のコンテンツ');
      
      const stats = manager.getStatistics();
      
      expect(stats.totalRequests).toBe(3);
      expect(stats.flaggedCount).toBeGreaterThanOrEqual(0);
      expect(stats.primaryFailures).toBe(0);
      expect(stats.fallbackUsage).toBe(0);
    });

    it('should track fallback usage', async () => {
      const failingPrimary = new MockModerationAdapter({ shouldFail: true });
      manager = new ModerationManager({
        primary: failingPrimary,
        fallback: fallbackAdapter,
        config
      });
      
      await manager.moderateWithThresholds('テスト1');
      await manager.moderateWithThresholds('テスト2');
      
      const stats = manager.getStatistics();
      
      expect(stats.primaryFailures).toBe(2);
      expect(stats.fallbackUsage).toBe(2);
    });
  });
});
