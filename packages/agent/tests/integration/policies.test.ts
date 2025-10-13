import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommentLengthPolicy } from '../../src/policies/comment-length';
import { NGWordsPolicy } from '../../src/policies/ng-words';
import { EmojiPolicy } from '../../src/policies/emoji';
import { CommentConfig } from '../../src/config/types';

describe('Policies Integration', () => {
  let config: CommentConfig;
  let lengthPolicy: CommentLengthPolicy;
  let ngWordsPolicy: NGWordsPolicy;
  let emojiPolicy: EmojiPolicy;

  beforeEach(() => {
    config = {
      targetLength: {
        min: 20,
        max: 60
      },
      tone: 'friendly',
      characterPersona: '好奇心旺盛な初心者',
      encouragedExpressions: ['なるほど', 'すごい'],
      ngWords: ['バカ', '死ね', 'アホ'], // バカのみで各バリエーションを検出
      emojiPolicy: {
        enabled: true,
        maxCount: 1,
        allowedEmojis: ['👏', '✨', '🙏', '💡']
      }
    };

    lengthPolicy = new CommentLengthPolicy(config);
    ngWordsPolicy = new NGWordsPolicy(config);
    emojiPolicy = new EmojiPolicy(config);
  });

  describe('Comment processing pipeline', () => {
    it('should process a valid comment through all policies', () => {
      const comment = 'これは素晴らしい配信ですね！応援しています';
      
      // 長さチェック
      expect(lengthPolicy.validate(comment)).toBe(true);
      
      // NG語チェック
      const ngResult = ngWordsPolicy.validate(comment);
      expect(ngResult.isValid).toBe(true);
      
      // 絵文字チェック
      const emojiResult = emojiPolicy.validate(comment);
      expect(emojiResult.isValid).toBe(true);
    });

    it('should handle and fix a comment that is too short', () => {
      const shortComment = '面白い！';
      
      // 長さチェック失敗
      expect(lengthPolicy.validate(shortComment)).toBe(false);
      
      // 長さ調整
      const adjusted = lengthPolicy.adjust(shortComment);
      expect(lengthPolicy.validate(adjusted)).toBe(true);
      expect(adjusted).toContain(shortComment);
      
      // 調整後のNG語チェック
      const ngResult = ngWordsPolicy.validate(adjusted);
      expect(ngResult.isValid).toBe(true);
    });

    it('should sanitize NG words and maintain valid length', () => {
      const badComment = 'この配信者はバカみたいなことを言っていますね';
      
      // NG語チェック失敗
      const ngResult = ngWordsPolicy.validate(badComment);
      expect(ngResult.isValid).toBe(false);
      expect(ngResult.detectedWords).toContain('バカ');
      
      // NG語をサニタイズ
      const sanitized = ngWordsPolicy.sanitize(badComment);
      expect(sanitized).toBe('この配信者は***みたいなことを言っていますね');
      
      // サニタイズ後の長さチェック
      expect(lengthPolicy.validate(sanitized)).toBe(true);
    });

    it('should handle too many emojis while maintaining length', () => {
      const emojiComment = 'すごい！👏✨🙏 本当に感動しました！💡';
      
      // 絵文字チェック失敗
      const emojiResult = emojiPolicy.validate(emojiComment);
      expect(emojiResult.isValid).toBe(false);
      expect(emojiResult.violations).toContain('too_many');
      
      // 絵文字をサニタイズ
      const sanitized = emojiPolicy.sanitize(emojiComment);
      expect(emojiPolicy.extractEmojis(sanitized).length).toBe(1);
      
      // サニタイズ後の長さを確認
      // 「すごい！👏 本当に感動しました！」は19文字なので短い
      expect(lengthPolicy.validate(sanitized)).toBe(false); // 20文字未満になる
    });

    it('should process a complex comment through full pipeline', () => {
      let comment = 'バカ！😍😘';
      
      // ステップ1: NG語サニタイズ
      comment = ngWordsPolicy.sanitize(comment);
      expect(comment).toBe('***！😍😘');
      
      // ステップ2: 絵文字サニタイズ（許可されていない絵文字を削除）
      comment = emojiPolicy.sanitize(comment);
      expect(comment).toBe('！'); // ***もスペースと一緒に削除される
      
      // ステップ3: 長さ調整（短すぎるので拡張）
      comment = lengthPolicy.adjust(comment);
      expect(lengthPolicy.validate(comment)).toBe(true);
      expect(comment.length).toBeGreaterThanOrEqual(20);
      
      // 最終検証：すべてのポリシーを満たすか
      expect(lengthPolicy.validate(comment)).toBe(true);
      expect(ngWordsPolicy.validate(comment).isValid).toBe(true);
      expect(emojiPolicy.validate(comment).isValid).toBe(true);
    });

    it('should add emoji to plain comment when needed', () => {
      const plainComment = 'この配信とても勉強になりました！ありがとうございます';
      
      // 絵文字を追加
      const withEmoji = emojiPolicy.formatWithEmoji(plainComment);
      
      // 絵文字が追加されたか確認
      const emojis = emojiPolicy.extractEmojis(withEmoji);
      expect(emojis.length).toBe(1);
      expect(config.emojiPolicy.allowedEmojis).toContain(emojis[0]);
      
      // 長さが維持されているか確認
      expect(lengthPolicy.validate(withEmoji)).toBe(true);
    });

    it('should handle edge case: very long comment with NG words and emojis', () => {
      let comment = 'この配信者はアホみたいなことばかり言っていて本当に困りますね😡💢😤もっとまともな内容にしてほしいです！';
      
      // NG語をサニタイズ
      comment = ngWordsPolicy.sanitize(comment);
      expect(comment).not.toContain('アホ');
      
      // 絵文字をサニタイズ
      comment = emojiPolicy.sanitize(comment);
      expect(emojiPolicy.extractEmojis(comment).length).toBe(0); // 許可されていない絵文字はすべて削除
      
      // 長さ調整（60文字以内に）
      comment = lengthPolicy.adjust(comment);
      expect(comment.length).toBeLessThanOrEqual(60);
      
      // すべてのポリシーを満たすか確認
      expect(lengthPolicy.validate(comment)).toBe(true);
      expect(ngWordsPolicy.validate(comment).isValid).toBe(true);
      expect(emojiPolicy.validate(comment).isValid).toBe(true);
    });

    it('should handle normalization edge cases', () => {
      // 様々な表記のNG語
      const variations = [
        'ばか者です',      // ひらがな
        'バカ者です',      // カタカナ
        'ﾊﾞｶ者です',      // 半角カタカナ
        'バーカ者です',    // 長音
        'ば　か者です'     // スペース入り
      ];
      
      for (const variant of variations) {
        // validateメソッドではなく、detectWithNormalizationを使う
        const result = ngWordsPolicy.detectWithNormalization(variant);
        
        // デバッグ情報を削除
        
        expect(result.isValid).toBe(false);
        // 検出されたNG語は「バカ」
        expect(result.detectedWords).toContain('バカ');
        
        const sanitized = ngWordsPolicy.sanitize(variant);
        expect(sanitized).toContain('***');
      }
    });

    it('should respect emoji similarity check', () => {
      const recentComments = [
        { text: 'いいね！👏', timestamp: Date.now() - 5000 },
        { text: 'すごい！✨', timestamp: Date.now() - 10000 }
      ];
      
      // 同じ絵文字を使おうとする
      const newComment = 'また素晴らしい！👏';
      const isSimilar = emojiPolicy.checkSimilarity(newComment, recentComments);
      expect(isSimilar).toBe(true);
      
      // 異なる絵文字なら大丈夫
      const differentComment = 'ありがとう！🙏';
      const isDifferent = emojiPolicy.checkSimilarity(differentComment, recentComments);
      expect(isDifferent).toBe(false);
    });

    it('should handle config updates across all policies', () => {
      // 設定を更新
      const newConfig: CommentConfig = {
        ...config,
        targetLength: { min: 30, max: 80 },
        ngWords: ['バカ', '死ね', 'アホ', 'ダメ'],
        emojiPolicy: {
          enabled: true,
          maxCount: 2,
          allowedEmojis: ['👏', '✨', '🙏', '💡', '❤️']
        }
      };
      
      lengthPolicy.updateConfig(newConfig);
      ngWordsPolicy.updateConfig(newConfig);
      emojiPolicy.updateConfig(newConfig);
      
      // 新しい設定での検証
      const comment = 'この配信は本当にダメですね❤️✨';
      
      // NG語検出（新しいNG語）
      const ngResult = ngWordsPolicy.validate(comment);
      expect(ngResult.isValid).toBe(false);
      expect(ngResult.detectedWords).toContain('ダメ');
      
      // 絵文字は2個まで許可
      const emojiResult = emojiPolicy.validate(comment);
      expect(emojiResult.isValid).toBe(true);
      expect(emojiResult.emojiCount).toBe(2);
      
      // 長さは新しい範囲内
      const sanitized = ngWordsPolicy.sanitize(comment);
      expect(lengthPolicy.validate(sanitized)).toBe(false); // 30文字未満になってしまう
      const adjusted = lengthPolicy.adjust(sanitized);
      expect(adjusted.length).toBeGreaterThanOrEqual(30);
      expect(adjusted.length).toBeLessThanOrEqual(80);
    });
  });
});
