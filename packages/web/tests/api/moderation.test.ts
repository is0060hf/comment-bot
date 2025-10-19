/**
 * Tsumiki AITDD - Red Phase  
 * モデレーションAPIのRoute Handlerテスト
 */

import { NextRequest } from 'next/server';
import { POST } from '../../src/app/api/moderation/test/route';

// モックの設定
jest.mock('../../src/lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

jest.mock('../../src/lib/moderation', () => ({
  testContentModeration: jest.fn(),
}));

describe('Moderation Test API Route Handler', () => {
  const mockAuth = require('../../src/lib/auth');
  const mockModeration = require('../../src/lib/moderation');

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.verifyAuth.mockResolvedValue(true);
  });

  describe('POST /api/moderation/test', () => {
    it('should test content moderation successfully', async () => {
      const testContent = 'これは安全なコンテンツです';
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
        provider: 'openai',
      };

      mockModeration.testContentModeration.mockResolvedValueOnce(mockResult);

      const request = new NextRequest('http://localhost:3000/api/moderation/test', {
        method: 'POST',
        body: JSON.stringify({ content: testContent }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.result).toEqual(mockResult);
      expect(mockModeration.testContentModeration).toHaveBeenCalledWith(testContent);
    });

    it('should handle flagged content', async () => {
      const testContent = '不適切なコンテンツ';
      const mockResult = {
        flagged: true,
        categories: ['hate', 'harassment'],
        scores: {
          hate: 0.9,
          harassment: 0.85,
          'self-harm': 0.0,
          sexual: 0.0,
          violence: 0.1,
          illegal: 0.0,
          graphic: 0.0,
        },
        suggestedAction: 'block',
        provider: 'openai',
      };

      mockModeration.testContentModeration.mockResolvedValueOnce(mockResult);

      const request = new NextRequest('http://localhost:3000/api/moderation/test', {
        method: 'POST',
        body: JSON.stringify({ content: testContent }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.result).toEqual(mockResult);
      expect(data.result.flagged).toBe(true);
      expect(data.result.suggestedAction).toBe('block');
    });

    it('should validate content length', async () => {
      const longContent = 'あ'.repeat(1001);

      const request = new NextRequest('http://localhost:3000/api/moderation/test', {
        method: 'POST',
        body: JSON.stringify({ content: longContent }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Content too long');
      expect(mockModeration.testContentModeration).not.toHaveBeenCalled();
    });

    it('should validate empty content', async () => {
      const request = new NextRequest('http://localhost:3000/api/moderation/test', {
        method: 'POST',
        body: JSON.stringify({ content: '' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Content is required');
      expect(mockModeration.testContentModeration).not.toHaveBeenCalled();
    });

    it('should handle missing content field', async () => {
      const request = new NextRequest('http://localhost:3000/api/moderation/test', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Content is required');
    });

    it('should handle authentication failure', async () => {
      mockAuth.verifyAuth.mockResolvedValueOnce(false);

      const request = new NextRequest('http://localhost:3000/api/moderation/test', {
        method: 'POST',
        body: JSON.stringify({ content: 'test' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should handle moderation service errors', async () => {
      mockModeration.testContentModeration.mockRejectedValueOnce(
        new Error('Moderation service unavailable')
      );

      const request = new NextRequest('http://localhost:3000/api/moderation/test', {
        method: 'POST',
        body: JSON.stringify({ content: 'test content' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to test moderation');
    });

    it('should include metadata in response', async () => {
      const testContent = 'テストコンテンツ';
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
        provider: 'openai',
      };

      mockModeration.testContentModeration.mockResolvedValueOnce(mockResult);

      const request = new NextRequest('http://localhost:3000/api/moderation/test', {
        method: 'POST',
        body: JSON.stringify({ content: testContent }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data).toMatchObject({
        success: true,
        result: mockResult,
        metadata: {
          contentLength: testContent.length,
          timestamp: expect.any(String),
        },
      });
    });
  });
});
