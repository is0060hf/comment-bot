import { YouTubeAdapter } from '../../src/adapters/youtube';
import { PostingLengthPolicy } from '../../src/policies/posting-length';
import { Logger, LogLevel } from '../../src/logging/logger';

describe('YouTube Posting Length Policy', () => {
  let policy: PostingLengthPolicy;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn()
    } as any;

    policy = new PostingLengthPolicy(mockLogger);
  });

  describe('validate', () => {
    it('should accept comments within YouTube limit', () => {
      const comment = 'これは適切な長さのコメントです。';
      const result = policy.validate(comment);
      
      expect(result.isValid).toBe(true);
      expect(result.length).toBe(comment.length);
      expect(result.exceedsLimit).toBe(false);
    });

    it('should reject comments exceeding 200 characters', () => {
      const comment = 'あ'.repeat(201);
      const result = policy.validate(comment);
      
      expect(result.isValid).toBe(false);
      expect(result.length).toBe(201);
      expect(result.exceedsLimit).toBe(true);
      expect(result.excessCharacters).toBe(1);
    });

    it('should handle exactly 200 characters', () => {
      const comment = 'あ'.repeat(200);
      const result = policy.validate(comment);
      
      expect(result.isValid).toBe(true);
      expect(result.length).toBe(200);
      expect(result.exceedsLimit).toBe(false);
    });

    it('should count emojis correctly', () => {
      // 絵文字は通常2文字分としてカウントされる
      const comment = '素晴らしい配信です！👍✨';
      const result = policy.validate(comment);
      
      expect(result.isValid).toBe(true);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should handle multi-byte characters correctly', () => {
      const comment = '日本語の文字列です。漢字、ひらがな、カタカナ、全角記号！';
      const result = policy.validate(comment);
      
      expect(result.isValid).toBe(true);
      expect(result.length).toBe(comment.length);
    });
  });

  describe('truncate', () => {
    it('should truncate long comments intelligently', () => {
      const comment = 'これは非常に長いコメントです。' + 'あ'.repeat(190);
      const result = policy.truncate(comment);
      
      expect(result.truncated).toBe(true);
      // YouTubeの文字数カウントで200文字以内であることを確認
      const validation = policy.validate(result.text);
      expect(validation.isValid).toBe(true);
      expect(validation.length).toBeLessThanOrEqual(200);
      expect(result.text.endsWith('...')).toBe(true);
    });

    it('should not truncate comments within limit', () => {
      const comment = 'これは適切な長さのコメントです。';
      const result = policy.truncate(comment);
      
      expect(result.truncated).toBe(false);
      expect(result.text).toBe(comment);
    });

    it('should truncate at word boundaries for better readability', () => {
      const comment = 'これはとても長い文章で、単語の境界で切り取られるべきです。' + 'あ'.repeat(180);
      const result = policy.truncate(comment);
      
      expect(result.truncated).toBe(true);
      // YouTubeの文字数カウントで200文字以内であることを確認
      const validation = policy.validate(result.text);
      expect(validation.isValid).toBe(true);
      expect(validation.length).toBeLessThanOrEqual(200);
      // 単語の途中で切れていないことを確認
      expect(result.text).not.toMatch(/[。、！？]\.\.\.$/);
    });

    it('should preserve important ending punctuation', () => {
      const comment = 'とても重要な質問です！' + 'あ'.repeat(190);
      const result = policy.truncate(comment, { preservePunctuation: true });
      
      expect(result.truncated).toBe(true);
      // 句読点が保持されているか確認（句読点の後に...が来る）
      const punctMatch = result.text.match(/([！？。])(.*)$/);
      expect(punctMatch).toBeTruthy();
      if (punctMatch) {
        expect(punctMatch[2]).toBe('...');
      }
    });

    it('should handle comments with URLs gracefully', () => {
      const comment = 'このサイトをチェック: https://very-long-url-example.com/with/many/paths/and/parameters?query=value ' + 'あ'.repeat(150);
      const result = policy.truncate(comment);
      
      expect(result.truncated).toBe(true);
      expect(result.removedUrls).toBe(true);
      expect(result.text).not.toContain('https://');
    });
  });

  describe('split', () => {
    it('should split very long comments into multiple parts', () => {
      const comment = 'パート1の内容です。' + 'あ'.repeat(190) + 'パート2の内容です。' + 'あ'.repeat(190);
      const result = policy.split(comment);
      
      expect(result.parts.length).toBeGreaterThan(1);
      result.parts.forEach((part: string, index: number) => {
        expect(part.length).toBeLessThanOrEqual(200);
        if (index < result.parts.length - 1) {
          expect(part).toContain('(続く)');
        }
      });
    });

    it('should add continuation markers', () => {
      const comment = 'あ'.repeat(400);
      const result = policy.split(comment);
      
      expect(result.parts.length).toBe(3);
      expect(result.parts[0]).toContain('(1/3)');
      expect(result.parts[1]).toContain('(2/3)');
      expect(result.parts[2]).toContain('(3/3)');
    });

    it('should not split comments within limit', () => {
      const comment = 'これは短いコメントです。';
      const result = policy.split(comment);
      
      expect(result.parts.length).toBe(1);
      expect(result.parts[0]).toBe(comment);
      expect(result.wasSplit).toBe(false);
    });
  });

  describe('integration with YouTubeAdapter', () => {
    it('should handle posting length errors gracefully', async () => {
      const mockYouTubeClient = {
        liveChatMessages: {
          insert: jest.fn().mockRejectedValueOnce({
            code: 400,
            message: 'The request metadata specifies an invalid textMessageDetails text string'
          })
        }
      };

      const adapter = new YouTubeAdapter({
        youtube: mockYouTubeClient as any
      });

      const longComment = 'あ'.repeat(201);
      
      await expect(adapter.postMessage('chatId', longComment))
        .rejects.toThrow('Message exceeds 200 characters limit');
    });
  });

  describe('statistics', () => {
    it('should track truncation statistics', () => {
      const policy = new PostingLengthPolicy(mockLogger);
      
      // いくつかのコメントを処理
      policy.validate('短いコメント');
      policy.truncate('あ'.repeat(250));
      policy.truncate('あ'.repeat(300));
      policy.split('あ'.repeat(500));
      
      const stats = policy.getStatistics();
      
      expect(stats.totalProcessed).toBe(4);
      expect(stats.truncatedCount).toBe(2);
      expect(stats.splitCount).toBe(1);
      expect(stats.averageLength).toBeGreaterThan(0);
      expect(stats.maxLength).toBe(500);
    });
  });
});
