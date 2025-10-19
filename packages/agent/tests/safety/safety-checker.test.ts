import { SafetyChecker } from '../../src/safety/safety-checker';
import { ModerationManager } from '../../src/core/moderation-manager';
import { SafetyConfig } from '../../src/config/types';
import { ModerationCategory } from '../../src/ports/moderation';
import { Logger, LogLevel } from '../../src/logging/logger';

jest.mock('../../src/core/moderation-manager');
jest.mock('../../src/logging/logger');

describe('SafetyChecker', () => {
  let safetyChecker: SafetyChecker;
  let mockModerationManager: jest.Mocked<ModerationManager>;
  let mockLogger: jest.Mocked<Logger>;
  
  const defaultConfig: SafetyConfig = {
    enabled: true,
    level: 'standard',
    blockOnUncertainty: true,
    moderationThresholds: {
      hate: 0.7,
      harassment: 0.7,
      selfHarm: 0.7,
      sexual: 0.7,
      violence: 0.7,
      illegal: 0.8,
      graphic: 0.8
    }
  };

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn()
    } as any;

    mockModerationManager = {
      moderateWithThresholds: jest.fn(),
      getStatistics: jest.fn()
    } as any;

    safetyChecker = new SafetyChecker({
      moderationManager: mockModerationManager,
      safetyConfig: defaultConfig
    });
  });

  describe('check', () => {
    it('安全性チェックが無効の場合、常に承認される', async () => {
      const disabledChecker = new SafetyChecker({
        moderationManager: mockModerationManager,
        safetyConfig: { ...defaultConfig, enabled: false }
      });

      const result = await disabledChecker.check('任意のコメント');
      
      expect(result.isSafe).toBe(true);
      expect(result.action).toBe('approve');
      expect(result.reason).toBe('safety_check_disabled');
    });

    it('個人情報が含まれる場合、ブロックされる', async () => {
      const result = await safetyChecker.check('私の電話番号は090-1234-5678です');
      
      expect(result.isSafe).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('personal_info');
    });

    it('メールアドレスが含まれる場合、ブロックされる', async () => {
      const result = await safetyChecker.check('連絡先: test@example.com');
      
      expect(result.isSafe).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('personal_info');
    });

    it('郵便番号が含まれる場合、ブロックされる', async () => {
      const result = await safetyChecker.check('〒123-4567 に住んでいます');
      
      expect(result.isSafe).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('personal_info');
    });

    it('モデレーションで承認される場合、承認される', async () => {
      mockModerationManager.moderateWithThresholds.mockResolvedValueOnce({
        flagged: false,
        scores: {
          hate: 0,
          harassment: 0,
          selfHarm: 0,
          sexual: 0,
          violence: 0,
          illegal: 0,
          graphic: 0
        },
        flaggedCategories: [],
        suggestedAction: 'approve',
        provider: 'mock'
      });

      const result = await safetyChecker.check('安全なコメント');
      
      expect(result.isSafe).toBe(true);
      expect(result.action).toBe('approve');
    });

    it('モデレーションでブロックされる場合、ブロックされる', async () => {
      mockModerationManager.moderateWithThresholds.mockResolvedValueOnce({
        flagged: true,
        scores: {
          hate: 0.9,
          harassment: 0,
          selfHarm: 0,
          sexual: 0,
          violence: 0,
          illegal: 0,
          graphic: 0
        },
        flaggedCategories: [ModerationCategory.HATE],
        suggestedAction: 'block',
        provider: 'mock'
      });

      const result = await safetyChecker.check('危険なコメント');
      
      expect(result.isSafe).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toBe('moderation_flagged');
    });

    it('レビューが必要な場合、strictレベルではブロックされる', async () => {
      const strictChecker = new SafetyChecker({
        moderationManager: mockModerationManager,
        safetyConfig: { ...defaultConfig, level: 'strict' }
      });

      mockModerationManager.moderateWithThresholds.mockResolvedValueOnce({
        flagged: true,
        scores: {
          hate: 0.6,
          harassment: 0,
          selfHarm: 0,
          sexual: 0,
          violence: 0,
          illegal: 0,
          graphic: 0
        },
        flaggedCategories: [ModerationCategory.HATE],
        suggestedAction: 'review',
        provider: 'mock'
      });

      const result = await strictChecker.check('微妙なコメント');
      
      expect(result.isSafe).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toBe('strict_threshold_exceeded');
    });

    it('レビューが必要な場合、standardレベルでは承認される', async () => {
      mockModerationManager.moderateWithThresholds.mockResolvedValueOnce({
        flagged: true,
        scores: {
          hate: 0.6,
          harassment: 0,
          selfHarm: 0,
          sexual: 0,
          violence: 0,
          illegal: 0,
          graphic: 0
        },
        flaggedCategories: [ModerationCategory.HATE],
        suggestedAction: 'review',
        provider: 'mock'
      });

      const result = await safetyChecker.check('微妙なコメント');
      
      expect(result.isSafe).toBe(true);
      expect(result.action).toBe('approve');
    });

    it('モデレーションエラー時、blockOnUncertaintyに従う', async () => {
      mockModerationManager.moderateWithThresholds.mockRejectedValueOnce(
        new Error('Moderation failed')
      );

      const result = await safetyChecker.check('チェック不可能なコメント');
      
      expect(result.isSafe).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toBe('moderation_error');
    });

    it('blockOnUncertaintyがfalseの場合、エラー時に承認される', async () => {
      const lenientChecker = new SafetyChecker({
        moderationManager: mockModerationManager,
        safetyConfig: { ...defaultConfig, blockOnUncertainty: false }
      });

      mockModerationManager.moderateWithThresholds.mockRejectedValueOnce(
        new Error('Moderation failed')
      );

      const result = await lenientChecker.check('チェック不可能なコメント');
      
      expect(result.isSafe).toBe(true);
      expect(result.action).toBe('approve_with_warning');
      expect(result.warning).toBe('moderation_unavailable');
    });
  });

  describe('tryRewrite', () => {
    it('リライトが成功し、再チェックで承認される場合', async () => {
      // Initial moderation suggests rewrite
      mockModerationManager.moderateWithThresholds
        .mockResolvedValueOnce({
          flagged: true,
          scores: {
            hate: 0.7,
            harassment: 0,
            selfHarm: 0,
            sexual: 0,
            violence: 0,
            illegal: 0,
            graphic: 0
          },
          flaggedCategories: [ModerationCategory.HATE],
          suggestedAction: 'rewrite',
          provider: 'mock'
        })
        // After rewrite, content is approved
        .mockResolvedValueOnce({
          flagged: false,
          scores: {
            hate: 0.1,
            harassment: 0,
            selfHarm: 0,
            sexual: 0,
            violence: 0,
            illegal: 0,
            graphic: 0
          },
          flaggedCategories: [],
          suggestedAction: 'approve',
          provider: 'mock'
        });

      // Mock the primary adapter's rewriteContent method
      const mockPrimaryAdapter = {
        rewriteContent: jest.fn().mockResolvedValueOnce({
          original: '危険なコメント',
          rewritten: '安全なコメント',
          wasRewritten: true
        })
      };
      
      // Access the private primary property via reflection
      (mockModerationManager as any).primary = mockPrimaryAdapter;

      const result = await safetyChecker.check('危険なコメント');
      
      expect(result.isSafe).toBe(true);
      expect(result.action).toBe('rewrite');
      expect(result.rewrittenComment).toBe('安全なコメント');
    });
  });

  describe('getStatistics', () => {
    it('統計情報を取得できる', async () => {
      // Perform some checks
      mockModerationManager.moderateWithThresholds.mockResolvedValue({
        flagged: false,
        scores: {
          hate: 0,
          harassment: 0,
          selfHarm: 0,
          sexual: 0,
          violence: 0,
          illegal: 0,
          graphic: 0
        },
        flaggedCategories: [],
        suggestedAction: 'approve',
        provider: 'mock'
      });

      await safetyChecker.check('安全なコメント1');
      await safetyChecker.check('安全なコメント2');
      await safetyChecker.check('個人情報: 090-1234-5678');

      const stats = safetyChecker.getStatistics();
      
      expect(stats.totalChecks).toBe(3);
      expect(stats.approvedCount).toBe(2);
      expect(stats.blockedCount).toBe(1);
    });
  });

  describe('updateConfig', () => {
    it('設定を更新できる', () => {
      const newConfig: SafetyConfig = {
        enabled: false,
        level: 'relaxed',
        blockOnUncertainty: false,
        moderationThresholds: {
          hate: 0.9,
          harassment: 0.9,
          selfHarm: 0.9,
          sexual: 0.9,
          violence: 0.9,
          illegal: 0.9,
          graphic: 0.9
        }
      };

      safetyChecker.updateConfig(newConfig);
      
      // Test that the new config is applied
      // (This would be tested through subsequent calls to check())
    });
  });
});