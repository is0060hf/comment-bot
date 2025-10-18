import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommentGenerationPrompt } from '../../src/prompts/comment-generation';
import { CommentClassificationPrompt } from '../../src/prompts/comment-classification';
import { CommentLengthPolicy } from '../../src/policies/comment-length';
import { NGWordsPolicy } from '../../src/policies/ng-words';
import { EmojiPolicy } from '../../src/policies/emoji';
import { CommentConfig } from '../../src/config/types';

describe('Prompt and Policy Integration', () => {
  let config: CommentConfig;
  let generationPrompt: CommentGenerationPrompt;
  let classificationPrompt: CommentClassificationPrompt;
  let lengthPolicy: CommentLengthPolicy;
  let ngWordsPolicy: NGWordsPolicy;
  let emojiPolicy: EmojiPolicy;

  beforeEach(() => {
    config = {
      targetLength: {
        min: 20,
        max: 60,
      },
      tone: 'friendly',
      characterPersona: '好奇心旺盛な初心者',
      encouragedExpressions: ['なるほど', 'すごい'],
      ngWords: ['バカ', '死ね', 'アホ'],
      emojiPolicy: {
        enabled: true,
        maxCount: 1,
        allowedEmojis: ['👏', '✨', '🙏', '💡'],
      },
    };

    generationPrompt = new CommentGenerationPrompt(config);
    classificationPrompt = new CommentClassificationPrompt(config);
    lengthPolicy = new CommentLengthPolicy(config);
    ngWordsPolicy = new NGWordsPolicy(config);
    emojiPolicy = new EmojiPolicy(config);
  });

  describe('Prompt generation with policy constraints', () => {
    it('should generate prompts that encourage policy-compliant comments', () => {
      const systemPrompt = generationPrompt.generateSystemPrompt();

      // 文字数制約が含まれているか
      expect(systemPrompt).toContain(config.targetLength.min.toString());
      expect(systemPrompt).toContain(config.targetLength.max.toString());

      // NG語の警告が含まれているか
      config.ngWords.forEach((word) => {
        expect(systemPrompt).toContain(word);
      });

      // 絵文字ポリシーが含まれているか
      expect(systemPrompt).toContain('絵文字');
      expect(systemPrompt).toContain(config.emojiPolicy.maxCount.toString());
    });

    it('should classify opportunities considering character constraints', () => {
      const systemPrompt = classificationPrompt.generateSystemPrompt();

      // キャラクター設定が考慮されているか
      expect(systemPrompt).toContain(config.characterPersona);

      // 連投防止ルールが含まれているか
      expect(systemPrompt).toContain('30秒');
    });
  });

  describe('Generated content validation', () => {
    it('should validate example comments in prompts', () => {
      const examples = generationPrompt.formatExamples();
      const exampleLines = examples.split('\n').filter((line) => line.match(/^\d+\./));

      exampleLines.forEach((line) => {
        const comment = line.replace(/^\d+\.\s*/, '');

        // 長さチェック
        const lengthValid = lengthPolicy.validate(comment);
        if (!lengthValid) {
          console.log(`Example comment too short/long: "${comment}" (${comment.length} chars)`);
        }

        // NG語チェック
        const ngResult = ngWordsPolicy.validate(comment);
        expect(ngResult.isValid).toBe(true);

        // 絵文字チェック
        const emojiResult = emojiPolicy.validate(comment);
        expect(emojiResult.isValid).toBe(true);
      });
    });
  });

  describe('Context-aware prompt generation', () => {
    it('should adapt prompts based on streaming context', () => {
      const context = {
        recentTopics: ['プログラミング', 'Python'],
        keywords: ['初心者', '学習'],
        transcript: 'Pythonを始めたばかりの初心者におすすめの学習方法を教えてください',
        chatHistory: [
          { author: '視聴者A', message: '私も初心者です！', timestamp: Date.now() - 10000 },
          { author: '視聴者B', message: 'Pythonいいですよね👏', timestamp: Date.now() - 5000 },
        ],
      };

      const userPrompt = generationPrompt.formatUserPrompt(context);

      // コンテキストが反映されているか
      expect(userPrompt).toContain('プログラミング');
      expect(userPrompt).toContain('Python');
      expect(userPrompt).toContain('初心者');
      expect(userPrompt).toContain('私も初心者です！');
    });

    it('should classify high opportunity for direct questions', () => {
      const context = {
        recentTopics: ['料理', 'レシピ'],
        keywords: ['簡単', 'おすすめ'],
        transcript: 'みなさんのおすすめの簡単レシピを教えてください！',
        lastCommentTime: Date.now() - 120000, // 2分前
        viewerEngagement: 'high' as const,
      };

      const userPrompt = classificationPrompt.formatUserPrompt(context);

      // 質問を含むコンテキストが高機会として認識されるか
      expect(userPrompt).toContain('教えてください');
      expect(userPrompt).toContain('high');
    });
  });

  describe('Policy-aware prompt adjustments', () => {
    it('should adjust prompts when emoji is disabled', () => {
      config.emojiPolicy.enabled = false;
      generationPrompt.updateConfig(config);

      const systemPrompt = generationPrompt.generateSystemPrompt();
      const examples = generationPrompt.formatExamples();

      expect(systemPrompt).toContain('絵文字は使用しない');

      // 例文に絵文字が含まれていないか
      const hasEmoji = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]/u.test(
        examples
      );
      expect(hasEmoji).toBe(false);
    });

    it('should emphasize length constraints in prompts', () => {
      config.targetLength = { min: 30, max: 50 };
      generationPrompt.updateConfig(config);

      const systemPrompt = generationPrompt.generateSystemPrompt();

      expect(systemPrompt).toContain('30');
      expect(systemPrompt).toContain('50');
    });

    it('should adapt classification for different tones', () => {
      config.tone = 'enthusiastic';
      classificationPrompt.updateConfig(config);

      const rules = classificationPrompt.formatClassificationRules();

      expect(rules).toContain('盛り上がり');
      expect(rules).toContain('感動');
    });
  });

  describe('Complete comment generation flow', () => {
    it('should generate policy-compliant comment instructions', () => {
      // 1. 機会を分類
      const classificationContext = {
        recentTopics: ['ゲーム実況'],
        keywords: ['難しい', 'ボス'],
        transcript: 'このボス難しすぎる！どうやって倒せばいいんだろう？',
        lastCommentTime: Date.now() - 60000,
        viewerEngagement: 'high' as const,
      };

      const classificationPrompt = new CommentClassificationPrompt(config);
      const classifyUserPrompt = classificationPrompt.formatUserPrompt(classificationContext);

      // 高機会として分類されるべき
      expect(classifyUserPrompt).toContain('どうやって');

      // 2. コメントを生成する指示
      const generationContext = {
        recentTopics: classificationContext.recentTopics,
        keywords: classificationContext.keywords,
        transcript: classificationContext.transcript,
        chatHistory: [],
      };

      const generateSystemPrompt = generationPrompt.generateSystemPrompt();
      const generateUserPrompt = generationPrompt.formatUserPrompt(generationContext);

      // すべてのポリシーが含まれているか
      expect(generateSystemPrompt).toContain('20文字以上、60文字以下');
      expect(generateSystemPrompt).toContain('絵文字は1個まで');
      expect(generateSystemPrompt).toContain('使用禁止語句');
      expect(generateSystemPrompt).toContain('なるほど');
      expect(generateSystemPrompt).toContain('すごい');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty encouraged expressions', () => {
      config.encouragedExpressions = [];
      generationPrompt.updateConfig(config);

      const systemPrompt = generationPrompt.generateSystemPrompt();

      // 推奨表現セクションが適切に処理されるか
      expect(systemPrompt).not.toContain('推奨表現:');
    });

    it('should handle empty NG words list', () => {
      config.ngWords = [];
      generationPrompt.updateConfig(config);

      const systemPrompt = generationPrompt.generateSystemPrompt();

      // NG語セクションが適切に処理されるか
      expect(systemPrompt).not.toContain('使用禁止語句');
    });

    it('should handle recent similar comments in classification', () => {
      const context = {
        recentTopics: ['音楽'],
        keywords: ['いい曲'],
        transcript: 'この曲いいですね！',
        lastCommentTime: Date.now() - 45000,
        viewerEngagement: 'medium' as const,
        recentComments: [
          { message: 'いい曲ですね！', timestamp: Date.now() - 20000 },
          { message: 'いい曲〜', timestamp: Date.now() - 15000 },
          { message: 'すごくいい！', timestamp: Date.now() - 10000 },
        ],
      };

      const userPrompt = classificationPrompt.formatUserPrompt(context);

      // 最近のコメント傾向が含まれるか
      expect(userPrompt).toMatch(/いい/);
      expect(userPrompt).toContain('最近のコメント傾向');
    });
  });
});
