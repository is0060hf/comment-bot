/**
 * Tsumiki AITDD - Red Phase
 * 安全設定Server Actionのテスト
 */

import { updateSafetySettings, testModeration } from '../../src/app/actions/safety';
import { SafetyConfig } from '../../src/shared/types';

// モックの設定
jest.mock('../../src/lib/api', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

describe('Safety Server Actions', () => {
  const mockApiClient = require('../../src/lib/api').apiClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateSafetySettings', () => {
    it('should successfully update safety settings', async () => {
      const mockSafetyConfig: SafetyConfig = {
        level: 'strict',
        enabled: true,
        blockOnUncertainty: true,
        moderationThresholds: {
          hate: 0.7,
          harassment: 0.7,
          'self-harm': 0.8,
          sexual: 0.8,
          violence: 0.7,
          illegal: 0.9,
          graphic: 0.8,
        },
      };

      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        data: { safety: mockSafetyConfig },
      });

      const result = await updateSafetySettings(mockSafetyConfig);

      expect(result.success).toBe(true);
      expect(result.data?.safety).toEqual(mockSafetyConfig);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/config', {
        safety: mockSafetyConfig,
      });
    });

    it('should validate safety level', async () => {
      const invalidConfig = {
        level: 'ultra-strict', // 無効なレベル
        enabled: true,
      } as any;

      const result = await updateSafetySettings(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid safety level');
    });

    it('should validate threshold values', async () => {
      const configWithInvalidThresholds: SafetyConfig = {
        level: 'standard',
        enabled: true,
        blockOnUncertainty: false,
        moderationThresholds: {
          hate: 1.5, // 無効な値（> 1.0）
          harassment: -0.1, // 無効な値（< 0）
          'self-harm': 0.8,
          sexual: 0.8,
          violence: 0.7,
          illegal: 0.9,
          graphic: 0.8,
        },
      };

      const result = await updateSafetySettings(configWithInvalidThresholds);

      expect(result.success).toBe(false);
      expect(result.error).toContain('threshold');
    });

    it('should handle partial updates', async () => {
      const partialConfig: Partial<SafetyConfig> = {
        level: 'relaxed',
        blockOnUncertainty: false,
      };

      mockApiClient.get.mockResolvedValueOnce({
        safety: {
          level: 'standard',
          enabled: true,
          blockOnUncertainty: true,
          moderationThresholds: {
            hate: 0.7,
            harassment: 0.7,
            'self-harm': 0.8,
            sexual: 0.8,
            violence: 0.7,
            illegal: 0.9,
            graphic: 0.8,
          },
        },
      });

      mockApiClient.post.mockResolvedValueOnce({
        success: true,
      });

      const result = await updateSafetySettings(partialConfig);

      expect(result.success).toBe(true);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/config', {
        safety: expect.objectContaining({
          level: 'relaxed',
          enabled: true, // 既存の値を保持
          blockOnUncertainty: false,
        }),
      });
    });
  });

  describe('testModeration', () => {
    it('should test content moderation', async () => {
      const testContent = 'これはテストコンテンツです';
      const mockResult = {
        flagged: false,
        categories: [],
        scores: {
          hate: 0.1,
          harassment: 0.1,
          'self-harm': 0.0,
          sexual: 0.0,
          violence: 0.1,
          illegal: 0.0,
          graphic: 0.0,
        },
        suggestedAction: 'approve',
      };

      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        result: mockResult,
      });

      const result = await testModeration(testContent);

      expect(result.success).toBe(true);
      expect(result.result).toEqual(mockResult);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/moderation/test', {
        content: testContent,
      });
    });

    it('should handle empty content', async () => {
      const result = await testModeration('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content cannot be empty');
    });

    it('should handle long content', async () => {
      const longContent = 'あ'.repeat(1001); // 1000文字を超える

      const result = await testModeration(longContent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content too long');
    });

    it('should handle moderation API errors', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Moderation service unavailable'));

      const result = await testModeration('test content');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to test moderation');
    });
  });
});
