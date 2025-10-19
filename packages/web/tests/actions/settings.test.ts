/**
 * Tsumiki AITDD - Red Phase
 * 設定更新Server Actionのテスト
 */

import { updateSettings } from '../../src/app/actions/settings';
import { AppConfig } from '../../src/shared/types';

// モックの設定
jest.mock('../../src/lib/api', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

describe('Settings Server Actions', () => {
  const mockApiClient = require('../../src/lib/api').apiClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateSettings', () => {
    it('should successfully update comment settings', async () => {
      const mockConfig: Partial<AppConfig> = {
        comment: {
          tone: 'friendly',
          characterPersona: 'フレンドリーな視聴者',
          targetLength: { min: 20, max: 100 },
          encouragedExpressions: ['なるほど！', 'すごい！'],
          ngWords: ['NG1', 'NG2'],
          emojiPolicy: {
            enabled: true,
            maxCount: 3,
            allowedEmojis: ['👍', '😊', '🎉'],
          },
        },
      };

      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        data: mockConfig,
      });

      const result = await updateSettings(mockConfig);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockConfig);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/config', mockConfig);
    });

    it('should handle validation errors', async () => {
      const invalidConfig = {
        comment: {
          tone: 'invalid-tone', // 無効な値
        },
      };

      const result = await updateSettings(invalidConfig as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should handle API errors gracefully', async () => {
      const mockConfig: Partial<AppConfig> = {
        comment: {
          tone: 'casual',
        },
      };

      mockApiClient.post.mockRejectedValueOnce(new Error('Network error'));

      const result = await updateSettings(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update settings');
    });

    it('should validate ngWords array', async () => {
      const configWithNgWords: Partial<AppConfig> = {
        comment: {
          ngWords: ['', '  ', 'valid'], // 空文字列を含む
        },
      };

      const result = await updateSettings(configWithNgWords);

      // 空文字列はフィルタリングされる
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/config', {
        comment: {
          ngWords: ['valid'],
        },
      });
    });

    it('should validate character limits', async () => {
      const configWithLimits: Partial<AppConfig> = {
        comment: {
          targetLength: { min: 100, max: 50 }, // min > max
        },
      };

      const result = await updateSettings(configWithLimits);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum length cannot exceed maximum');
    });
  });
});
