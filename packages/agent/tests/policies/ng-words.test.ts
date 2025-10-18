import { describe, it, expect, beforeEach } from '@jest/globals';
import { NGWordsPolicy } from '../../src/policies/ng-words';
import { CommentConfig } from '../../src/config/types';

describe('NGWordsPolicy', () => {
  let policy: NGWordsPolicy;
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
      ngWords: [
        // 基本的なNG語
        '死ね',
        'バカ',
        'アホ',
        '消えろ',
        'クソ',
        // URLパターン
        'http://',
        'https://',
        // 個人情報パターン
        '090-',
        '080-',
        '@gmail.com',
      ],
      emojiPolicy: {
        enabled: true,
        maxCount: 1,
        allowedEmojis: ['👏', '✨', '🙏', '💡'],
      },
    };

    policy = new NGWordsPolicy(config);
  });

  describe('validate', () => {
    it('should accept clean comments', () => {
      const cleanComment = 'これは素晴らしい配信ですね！勉強になります。';
      expect(policy.validate(cleanComment)).toEqual({
        isValid: true,
        detectedWords: [],
      });
    });

    it('should detect basic NG words', () => {
      const ngComment = 'このバカ野郎！消えろ！';
      const result = policy.validate(ngComment);

      expect(result.isValid).toBe(false);
      expect(result.detectedWords).toContain('バカ');
      expect(result.detectedWords).toContain('消えろ');
    });

    it('should detect URLs', () => {
      const urlComment = '詳細はhttps://example.comを見てください';
      const result = policy.validate(urlComment);

      expect(result.isValid).toBe(false);
      expect(result.detectedWords).toContain('https://');
    });
  });

  describe('normalize', () => {
    it('should normalize hiragana to katakana', () => {
      // 「ばか」→「バカ」
      const normalized = policy.normalize('ばか野郎');
      expect(normalized).toBe('バカ野郎');
    });

    it('should normalize full-width to half-width alphanumeric', () => {
      // 全角英数字を半角に
      const normalized = policy.normalize('ＨＴＴＰｓ：／／ｅｘａｍｐｌｅ．ｃｏｍ');
      expect(normalized).toContain('https://example.com');
    });

    it('should remove character repetitions', () => {
      // 繰り返し文字を正規化
      const normalized = policy.normalize('ばかああああああ');
      expect(normalized).toBe('バカアア'); // アア（2文字）に削減

      const normalized2 = policy.normalize('死ねええええ');
      expect(normalized2).toBe('死ネエエ'); // エエ（2文字）に削減
    });

    it('should handle complex normalization', () => {
      // 複合的な正規化
      const input = 'ばぁぁぁかああ野郎ＨＴＴＰｓ：／／死ねええ';
      const normalized = policy.normalize(input);

      expect(normalized).toContain('バアアカアア野郎'); // ァ→ア変換後
      expect(normalized).toContain('https://'); // 小文字化
      expect(normalized).toContain('死ネエエ');
    });

    it('should normalize spaces and special characters', () => {
      const normalized = policy.normalize('バ　カ　野　郎'); // 全角スペース
      expect(normalized).toBe('バカ野郎');

      const normalized2 = policy.normalize('バ・カ・野・郎');
      expect(normalized2).toBe('バカ野郎');
    });
  });

  describe('detectWithNormalization', () => {
    it('should detect NG words after normalization', () => {
      const variations = [
        'ばか野郎', // ひらがな
        'バカ野郎', // カタカナ
        'ﾊﾞｶ野郎', // 半角カナ
        'ば　か野郎', // スペース入り
        'ばかああ野郎', // 繰り返し
        'バァカ野郎', // 長音
      ];

      for (const variant of variations) {
        const result = policy.detectWithNormalization(variant);

        // デバッグ出力（失敗時のみ）
        if (result.isValid) {
          console.log(`Failed to detect NG word in: "${variant}"`);
          console.log(`  Normalized: "${result.normalizedText}"`);
          console.log(`  Detected words: ${result.detectedWords.join(', ')}`);
        }

        expect(result.isValid).toBe(false);
        // 正規化されたテキストを確認
        if (variant === 'バァカ野郎') {
          expect(result.normalizedText).toContain('バアカ');
        } else {
          expect(result.normalizedText).toContain('バカ');
        }
        expect(result.detectedWords).toContain('バカ');
      }
    });

    it('should detect URLs with various formats', () => {
      const urlVariations = [
        'ｈｔｔｐ：／／ｅｘａｍｐｌｅ．ｃｏｍ', // 全角
        'ＨＴＴＰ：／／ＥＸＡＭＰＬＥ．ＣＯＭ', // 全角大文字
        'http://example.com', // 半角
        'HTTP://EXAMPLE.COM', // 半角大文字
      ];

      for (const url of urlVariations) {
        const result = policy.detectWithNormalization(url);
        expect(result.isValid).toBe(false);
        expect(result.detectedWords.some((w: string) => w.includes('http://'))).toBe(true);
      }
    });
  });

  describe('sanitize', () => {
    it('should remove NG words from text', () => {
      const input = 'このバカ野郎は本当に消えろと思う';
      const sanitized = policy.sanitize(input);

      expect(sanitized).not.toContain('バカ');
      expect(sanitized).not.toContain('消えろ');
      expect(sanitized).toContain('***');
    });

    it('should sanitize with normalization', () => {
      const input = 'ばかああ野郎のくそったれ';
      const sanitized = policy.sanitize(input);

      expect(sanitized).not.toContain('ばか');
      expect(sanitized).not.toContain('バカ');
      expect(sanitized).not.toContain('クソ');
      expect(sanitized).toContain('***');
    });

    it('should preserve safe content', () => {
      const safeInput = 'これは安全で素晴らしいコメントです';
      const sanitized = policy.sanitize(safeInput);

      expect(sanitized).toBe(safeInput);
    });
  });

  describe('addNGWord', () => {
    it('should add new NG words dynamically', () => {
      const newWord = 'テスト禁止語';
      policy.addNGWord(newWord);

      const result = policy.validate('これはテスト禁止語を含むコメント');
      expect(result.isValid).toBe(false);
      expect(result.detectedWords).toContain('テスト禁止語');
    });

    it('should normalize added NG words', () => {
      policy.addNGWord('てすと');

      // カタカナ版も検出される
      const result = policy.validate('テストコメント');
      expect(result.isValid).toBe(false);
    });
  });

  describe('removeNGWord', () => {
    it('should remove NG words', () => {
      policy.removeNGWord('バカ');

      const result = policy.validate('バカと言っても大丈夫');
      expect(result.isValid).toBe(true);
    });
  });

  describe('getDefaultNGWords', () => {
    it('should provide default NG word list', () => {
      const defaults = NGWordsPolicy.getDefaultNGWords();

      expect(defaults).toContain('死ね');
      expect(defaults).toContain('バカ');
      expect(defaults).toContain('http://');
      expect(defaults.length).toBeGreaterThan(10);
    });
  });

  describe('integration', () => {
    it('should work with LLM generated content', () => {
      // LLMが生成したコンテンツをチェック
      const llmOutput = 'この配信はばかみたいに面白いですね！';

      const result = policy.detectWithNormalization(llmOutput);
      expect(result.isValid).toBe(false);

      // サニタイズして安全に
      const sanitized = policy.sanitize(llmOutput);
      const checkSanitized = policy.validate(sanitized);
      expect(checkSanitized.isValid).toBe(true);
    });
  });
});
