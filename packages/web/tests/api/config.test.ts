/**
 * Tsumiki AITDD - Red Phase
 * 設定APIのRoute Handlerテスト
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '../../src/app/api/config/route';
import { AppConfig } from '../../src/shared/types';

// モックの設定
jest.mock('../../src/lib/edge-config', () => ({
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
}));

jest.mock('../../src/lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

describe('Config API Route Handler', () => {
  const mockEdgeConfig = require('../../src/lib/edge-config');
  const mockAuth = require('../../src/lib/auth');

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.verifyAuth.mockResolvedValue(true); // デフォルトで認証成功
  });

  describe('GET /api/config', () => {
    it('should return current configuration', async () => {
      const mockConfig: Partial<AppConfig> = {
        comment: {
          tone: 'friendly',
          characterPersona: 'テスト用ペルソナ',
          targetLength: { min: 20, max: 100 },
        },
      };

      mockEdgeConfig.getConfig.mockResolvedValueOnce(mockConfig);

      const request = new NextRequest('http://localhost:3000/api/config');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockConfig);
      expect(mockEdgeConfig.getConfig).toHaveBeenCalled();
    });

    it('should handle authentication failure', async () => {
      mockAuth.verifyAuth.mockResolvedValueOnce(false);

      const request = new NextRequest('http://localhost:3000/api/config');
      const response = await GET(request);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should handle edge config errors', async () => {
      mockEdgeConfig.getConfig.mockRejectedValueOnce(new Error('Edge config unavailable'));

      const request = new NextRequest('http://localhost:3000/api/config');
      const response = await GET(request);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Failed to fetch configuration',
      });
    });

    it('should support config section query parameter', async () => {
      const mockConfig = {
        comment: { tone: 'friendly' },
        safety: { level: 'standard' },
      };

      mockEdgeConfig.getConfig.mockResolvedValueOnce(mockConfig);

      const request = new NextRequest('http://localhost:3000/api/config?section=comment');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ comment: mockConfig.comment });
    });
  });

  describe('POST /api/config', () => {
    it('should update configuration', async () => {
      const updateData: Partial<AppConfig> = {
        comment: {
          tone: 'casual',
          ngWords: ['NG1', 'NG2'],
        },
      };

      mockEdgeConfig.updateConfig.mockResolvedValueOnce({
        success: true,
        data: updateData,
      });

      const request = new NextRequest('http://localhost:3000/api/config', {
        method: 'POST',
        body: JSON.stringify(updateData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(updateData);
      expect(mockEdgeConfig.updateConfig).toHaveBeenCalledWith(updateData);
    });

    it('should validate request body', async () => {
      const invalidData = 'invalid json';

      const request = new NextRequest('http://localhost:3000/api/config', {
        method: 'POST',
        body: invalidData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid configuration');
    });

    it('should handle empty request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/config', {
        method: 'POST',
        body: '',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid');
    });

    it('should handle edge config update errors', async () => {
      mockEdgeConfig.updateConfig.mockRejectedValueOnce(new Error('Update failed'));

      const request = new NextRequest('http://localhost:3000/api/config', {
        method: 'POST',
        body: JSON.stringify({ comment: { tone: 'friendly' } }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Failed to update configuration',
      });
    });

    it('should sanitize sensitive data before saving', async () => {
      const dataWithSecrets = {
        youtube: {
          clientId: 'should-be-removed',
          clientSecret: 'should-be-removed',
          refreshToken: 'should-be-removed',
        },
        comment: {
          tone: 'friendly',
        },
      };

      mockEdgeConfig.updateConfig.mockResolvedValueOnce({ success: true });

      const request = new NextRequest('http://localhost:3000/api/config', {
        method: 'POST',
        body: JSON.stringify(dataWithSecrets),
      });

      await POST(request);

      // シークレット情報は削除されている
      expect(mockEdgeConfig.updateConfig).toHaveBeenCalledWith({
        comment: {
          tone: 'friendly',
        },
      });
    });
  });
});
