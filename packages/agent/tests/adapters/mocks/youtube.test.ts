import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockYouTubeAdapter } from '../../../src/adapters/mocks/youtube';
import {
  YouTubePort,
  LiveChatMessage,
  YouTubeError,
  RateLimitInfo,
} from '../../../src/ports/youtube';

describe('MockYouTubeAdapter', () => {
  let adapter: MockYouTubeAdapter;

  beforeEach(() => {
    adapter = new MockYouTubeAdapter();
  });

  describe('postMessage', () => {
    it('should successfully post a message', async () => {
      const message = 'テストコメントです！';
      const liveChatId = 'mock-live-chat-id';

      const result = await adapter.postMessage(liveChatId, message);

      expect(result.id).toBeTruthy();
      expect(result.snippet.textMessageDetails.messageText).toBe(message);
      expect(result.snippet.liveChatId).toBe(liveChatId);
      expect(result.snippet.publishedAt).toBeTruthy();
    });

    it('should enforce character limit', async () => {
      const longMessage = 'あ'.repeat(201); // 201文字
      const liveChatId = 'mock-live-chat-id';

      await expect(adapter.postMessage(liveChatId, longMessage)).rejects.toThrow(YouTubeError);
    });

    it('should handle rate limit errors', async () => {
      const rateLimitedAdapter = new MockYouTubeAdapter({
        rateLimitExceeded: true,
      });

      try {
        await rateLimitedAdapter.postMessage('chat-id', 'message');
        fail('Should have thrown rate limit error');
      } catch (error) {
        expect(error).toBeInstanceOf(YouTubeError);
        expect((error as YouTubeError).code).toBe('RATE_LIMIT_EXCEEDED');
        expect((error as YouTubeError).retryable).toBe(true);
      }
    });

    it('should simulate random failures', async () => {
      const failingAdapter = new MockYouTubeAdapter({
        failureRate: 1.0,
      });

      await expect(failingAdapter.postMessage('chat-id', 'message')).rejects.toThrow(YouTubeError);
    });
  });

  describe('getLiveChatId', () => {
    it('should retrieve live chat ID for active stream', async () => {
      const videoId = 'mock-video-id';

      const liveChatId = await adapter.getLiveChatId(videoId);

      expect(liveChatId).toBeTruthy();
      expect(liveChatId).toContain('mock-live-chat-');
    });

    it('should throw error for non-live video', async () => {
      const nonLiveAdapter = new MockYouTubeAdapter({
        isLive: false,
      });

      await expect(nonLiveAdapter.getLiveChatId('video-id')).rejects.toThrow(YouTubeError);
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return current rate limit information', async () => {
      const info = await adapter.getRateLimitInfo();

      expect(info.limit).toBe(30);
      expect(info.remaining).toBeGreaterThanOrEqual(0);
      expect(info.remaining).toBeLessThanOrEqual(30);
      expect(info.resetAt).toBeInstanceOf(Date);
      expect(info.retryAfter).toBeUndefined();
    });

    it('should include retry after when rate limited', async () => {
      const rateLimitedAdapter = new MockYouTubeAdapter({
        rateLimitExceeded: true,
      });

      const info = await rateLimitedAdapter.getRateLimitInfo();

      expect(info.remaining).toBe(0);
      expect(info.retryAfter).toBeDefined();
      expect(info.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('isHealthy', () => {
    it('should return health status', async () => {
      const health = await adapter.isHealthy();
      expect(health).toBe(true);
    });

    it('should return false when configured unhealthy', async () => {
      const unhealthyAdapter = new MockYouTubeAdapter({
        healthy: false,
      });
      const health = await unhealthyAdapter.isHealthy();
      expect(health).toBe(false);
    });
  });

  describe('message rate tracking', () => {
    it('should track messages within time window', async () => {
      const liveChatId = 'mock-live-chat-id';

      // Post multiple messages
      for (let i = 0; i < 5; i++) {
        await adapter.postMessage(liveChatId, `Message ${i}`);
      }

      const info = await adapter.getRateLimitInfo();
      expect(info.remaining).toBe(25); // 30 - 5
    });

    it('should reset rate limit after window', async () => {
      const fastAdapter = new MockYouTubeAdapter({
        rateLimitWindowMs: 100, // 100ms window for testing
      });

      const liveChatId = 'mock-live-chat-id';

      // Post a message
      await fastAdapter.postMessage(liveChatId, 'First message');
      let info = await fastAdapter.getRateLimitInfo();
      expect(info.remaining).toBe(29);

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      info = await fastAdapter.getRateLimitInfo();
      expect(info.remaining).toBe(30);
    });
  });
});
