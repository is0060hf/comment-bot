import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommentLengthPolicy } from '../../src/policies/comment-length';
import { CommentConfig } from '../../src/config/types';

describe('CommentLengthPolicy', () => {
  let policy: CommentLengthPolicy;
  let config: CommentConfig;

  beforeEach(() => {
    config = {
      targetLength: {
        min: 20,
        max: 60
      },
      tone: 'friendly',
      characterPersona: '好奇心旺盛な初心者',
      encouragedExpressions: ['なるほど', 'すごい'],
      ngWords: [],
      emojiPolicy: {
        enabled: true,
        maxCount: 1,
        allowedEmojis: ['👏', '✨', '🙏', '💡']
      }
    };
    
    policy = new CommentLengthPolicy(config);
  });

  describe('validate', () => {
    it('should accept comments within length range', () => {
      const validComment = 'これは適切な長さのコメントです！素晴らしいですね。';
      expect(policy.validate(validComment)).toBe(true);
    });

    it('should reject comments that are too short', () => {
      const shortComment = 'いいね！';
      expect(policy.validate(shortComment)).toBe(false);
    });

    it('should reject comments that are too long', () => {
      // 60文字を超えるコメントを作成
      const longComment = 'これは非常に長いコメントで、60文字を超えているため、ポリシーに違反しています。もっと短くする必要がありますので調整が必要です。';
      expect(policy.countCharacters(longComment)).toBeGreaterThan(60);
      expect(policy.validate(longComment)).toBe(false);
    });

    it('should count characters correctly with emojis', () => {
      const commentWithEmoji = 'すごい！👏 これは素晴らしい発見ですね！';
      const count = policy.countCharacters(commentWithEmoji);
      expect(count).toBe(21); // String.lengthでカウント（絵文字は2バイト）
    });
  });

  describe('adjust', () => {
    it('should extend short comments', () => {
      const shortComment = 'すごい！';
      const adjusted = policy.adjust(shortComment);
      
      expect(adjusted.length).toBeGreaterThanOrEqual(20);
      expect(adjusted).toContain(shortComment);
      expect(adjusted).toMatch(/[。！]$/); // 適切な終端文字
    });

    it('should truncate long comments intelligently', () => {
      const longComment = 'これは非常に長いコメントです。たくさんの情報が含まれていて、全体の長さが60文字を超えています。短くする必要があります。';
      const adjusted = policy.adjust(longComment);
      
      expect(adjusted.length).toBeLessThanOrEqual(60);
      expect(adjusted.length).toBeGreaterThanOrEqual(20);
      // 文の区切りで切る
      expect(adjusted).toMatch(/[。！…]$/);
    });

    it('should not modify comments within range', () => {
      const validComment = 'これは適切な長さのコメントです！ちょうどいい感じです。'; // 26文字
      const adjusted = policy.adjust(validComment);
      
      expect(adjusted).toBe(validComment);
    });

    it('should handle edge case of extremely short comments', () => {
      const veryShort = 'あ';
      const adjusted = policy.adjust(veryShort);
      
      expect(adjusted.length).toBeGreaterThanOrEqual(20);
      expect(adjusted).toContain('あ');
    });
  });

  describe('formatComment', () => {
    it('should apply formatting with length adjustment', () => {
      const comment = 'いいね';
      const formatted = policy.formatComment(comment);
      
      expect(formatted.length).toBeGreaterThanOrEqual(20);
      expect(formatted.length).toBeLessThanOrEqual(60);
    });

    it('should integrate with LLM output formatting', () => {
      // LLMが長すぎる出力を生成した場合
      const llmOutput = '本当に素晴らしい配信ですね！今日学んだことをまとめると、第一に基礎的な概念の理解が重要で、第二に実践的な応用が必要で、第三に継続的な学習が大切だということがわかりました。';
      const formatted = policy.formatComment(llmOutput);
      
      expect(formatted.length).toBeLessThanOrEqual(60);
      // 重要な情報（最初の感想）は保持される
      expect(formatted).toContain('素晴らしい');
    });
  });

  describe('getStats', () => {
    it('should return comment statistics', () => {
      const comment = 'これはテストコメントです！👏';
      const stats = policy.getStats(comment);
      
      expect(stats).toEqual({
        length: 15,
        isValid: false, // 20文字未満
        needsAdjustment: true,
        adjustmentType: 'extend'
      });
    });

    it('should identify truncation needs', () => {
      const longComment = 'a'.repeat(100);
      const stats = policy.getStats(longComment);
      
      expect(stats).toEqual({
        length: 100,
        isValid: false,
        needsAdjustment: true,
        adjustmentType: 'truncate'
      });
    });
  });

  describe('config updates', () => {
    it('should respond to config changes', () => {
      // 設定を更新
      const newConfig = {
        ...config,
        targetLength: {
          min: 30,
          max: 50
        }
      };
      
      policy.updateConfig(newConfig);
      
      // 新しい範囲でバリデーション
      const comment25 = 'これは25文字のコメントです。ちょうど25文字。';
      expect(policy.validate(comment25)).toBe(false); // 30文字未満
    });
  });
});
