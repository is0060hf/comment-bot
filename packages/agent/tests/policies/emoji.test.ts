import { describe, it, expect, beforeEach } from '@jest/globals';
import { EmojiPolicy } from '../../src/policies/emoji';
import { CommentConfig } from '../../src/config/types';

describe('EmojiPolicy', () => {
  let policy: EmojiPolicy;
  let config: CommentConfig;

  beforeEach(() => {
    config = {
      targetLength: {
        min: 20,
        max: 60,
      },
      tone: 'friendly',
      characterPersona: '好奇心旺盛な初心者',
      encouragedExpressions: ['なるほど', 'すごい'],
      ngWords: [],
      emojiPolicy: {
        enabled: true,
        maxCount: 1,
        allowedEmojis: ['👏', '✨', '🙏', '💡'],
      },
    };

    policy = new EmojiPolicy(config);
  });

  describe('validate', () => {
    it('should accept comments without emojis', () => {
      const comment = 'これは素晴らしい配信ですね！';
      const result = policy.validate(comment);

      expect(result.isValid).toBe(true);
      expect(result.emojiCount).toBe(0);
      expect(result.detectedEmojis).toEqual([]);
    });

    it('should accept comments with allowed emojis within limit', () => {
      const comment = 'すごい！👏';
      const result = policy.validate(comment);

      expect(result.isValid).toBe(true);
      expect(result.emojiCount).toBe(1);
      expect(result.detectedEmojis).toEqual(['👏']);
    });

    it('should reject comments with too many emojis', () => {
      const comment = 'すごい！👏✨ 最高です！🙏';
      const result = policy.validate(comment);

      expect(result.isValid).toBe(false);
      expect(result.emojiCount).toBe(3);
      expect(result.detectedEmojis).toEqual(['👏', '✨', '🙏']);
      expect(result.violations).toContain('too_many');
    });

    it('should reject comments with disallowed emojis', () => {
      const comment = 'いいね！😍';
      const result = policy.validate(comment);

      expect(result.isValid).toBe(false);
      expect(result.detectedEmojis).toEqual(['😍']);
      expect(result.violations).toContain('not_allowed');
    });

    it('should handle disabled emoji policy', () => {
      config.emojiPolicy.enabled = false;
      policy = new EmojiPolicy(config);

      const comment = 'たくさんの絵文字！😍🎉🎊🎈🎆';
      const result = policy.validate(comment);

      expect(result.isValid).toBe(true);
    });
  });

  describe('extractEmojis', () => {
    it('should extract all emojis from text', () => {
      const text = 'Hello 👋 World 🌍! How are you? 😊';
      const emojis = policy.extractEmojis(text);

      expect(emojis).toEqual(['👋', '🌍', '😊']);
    });

    it('should handle emoji variants and sequences', () => {
      const text = '👨‍👩‍👧‍👦 Family emoji and ❤️ heart';
      const emojis = policy.extractEmojis(text);

      expect(emojis).toContain('👨‍👩‍👧‍👦');
      expect(emojis).toContain('❤️');
    });

    it('should handle text with no emojis', () => {
      const text = 'Just plain text without any emojis';
      const emojis = policy.extractEmojis(text);

      expect(emojis).toEqual([]);
    });
  });

  describe('sanitize', () => {
    it('should remove excess emojis keeping only allowed ones up to limit', () => {
      const comment = 'すごい！👏✨🙏💡 最高です！';
      const sanitized = policy.sanitize(comment);

      expect(sanitized).toBe('すごい！👏 最高です！');
      expect(policy.extractEmojis(sanitized).length).toBe(1);
    });

    it('should remove all disallowed emojis', () => {
      const comment = 'いいね！😍 すごい！👏 最高！🎉';
      const sanitized = policy.sanitize(comment);

      expect(sanitized).toBe('いいね！ すごい！👏 最高！');
      expect(sanitized).not.toContain('😍');
      expect(sanitized).not.toContain('🎉');
    });

    it('should handle comments with only disallowed emojis', () => {
      const comment = 'これは😍😘🥰素晴らしい！';
      const sanitized = policy.sanitize(comment);

      expect(sanitized).toBe('これは素晴らしい！');
    });

    it('should preserve text structure when removing emojis', () => {
      const comment = '最初👏の👏絵文字👏です';
      const sanitized = policy.sanitize(comment);

      expect(sanitized).toBe('最初👏の絵文字です');
    });
  });

  describe('checkSimilarity', () => {
    it('should detect similar emojis in recent history', () => {
      const recentComments = [
        { text: 'いいね！👏', timestamp: Date.now() - 5000 },
        { text: 'すごい！✨', timestamp: Date.now() - 10000 },
      ];

      const isSimilar = policy.checkSimilarity('また拍手！👏', recentComments);
      expect(isSimilar).toBe(true);
    });

    it('should not flag different emojis as similar', () => {
      const recentComments = [
        { text: 'いいね！👏', timestamp: Date.now() - 5000 },
        { text: 'すごい！✨', timestamp: Date.now() - 10000 },
      ];

      const isSimilar = policy.checkSimilarity('ありがとう！🙏', recentComments);
      expect(isSimilar).toBe(false);
    });

    it('should ignore old comments beyond time window', () => {
      const recentComments = [
        { text: 'いいね！👏', timestamp: Date.now() - 120000 }, // 2分前
      ];

      const isSimilar = policy.checkSimilarity('また拍手！👏', recentComments, 60000); // 1分窓
      expect(isSimilar).toBe(false);
    });

    it('should handle comments without emojis', () => {
      const recentComments = [
        { text: 'いいね！', timestamp: Date.now() - 5000 },
        { text: 'すごい！', timestamp: Date.now() - 10000 },
      ];

      const isSimilar = policy.checkSimilarity('ありがとう！', recentComments);
      expect(isSimilar).toBe(false);
    });
  });

  describe('formatWithEmoji', () => {
    it('should add appropriate emoji to comment', () => {
      const comment = 'これは素晴らしいですね';
      const formatted = policy.formatWithEmoji(comment);

      const emojis = policy.extractEmojis(formatted);
      expect(emojis.length).toBe(1);
      expect(config.emojiPolicy.allowedEmojis).toContain(emojis[0]);
    });

    it('should not add emoji if already present', () => {
      const comment = 'これは素晴らしいですね！👏';
      const formatted = policy.formatWithEmoji(comment);

      expect(formatted).toBe(comment);
      expect(policy.extractEmojis(formatted).length).toBe(1);
    });

    it('should respect emoji limit when adding', () => {
      const comment = 'すごい！👏 最高です';
      const formatted = policy.formatWithEmoji(comment);

      expect(formatted).toBe(comment); // 既に上限なので追加しない
    });

    it('should handle disabled emoji policy', () => {
      config.emojiPolicy.enabled = false;
      policy = new EmojiPolicy(config);

      const comment = 'これは素晴らしいですね';
      const formatted = policy.formatWithEmoji(comment);

      expect(formatted).toBe(comment);
      expect(policy.extractEmojis(formatted).length).toBe(0);
    });
  });

  describe('config updates', () => {
    it('should respond to config changes', () => {
      // 最大数を2に変更
      const newConfig = {
        ...config,
        emojiPolicy: {
          ...config.emojiPolicy,
          maxCount: 2,
        },
      };

      policy.updateConfig(newConfig);

      const comment = 'すごい！👏✨';
      const result = policy.validate(comment);
      expect(result.isValid).toBe(true); // 2個まで許可
    });

    it('should handle empty allowed emoji list', () => {
      const newConfig = {
        ...config,
        emojiPolicy: {
          ...config.emojiPolicy,
          allowedEmojis: [],
        },
      };

      policy.updateConfig(newConfig);

      const comment = 'すごい！👏';
      const result = policy.validate(comment);
      expect(result.isValid).toBe(false);
      expect(result.violations).toContain('not_allowed');
    });
  });
});
