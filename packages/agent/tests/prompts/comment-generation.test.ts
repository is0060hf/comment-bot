import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommentGenerationPrompt } from '../../src/prompts/comment-generation';
import { CommentConfig } from '../../src/config/types';

describe('CommentGenerationPrompt', () => {
  let config: CommentConfig;
  let prompt: CommentGenerationPrompt;

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

    prompt = new CommentGenerationPrompt(config);
  });

  describe('generateSystemPrompt', () => {
    it('should include basic role instructions', () => {
      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('YouTube配信へのコメント');
      expect(systemPrompt).toContain('視聴者');
      expect(systemPrompt).toContain('日本語');
    });

    it('should include character persona', () => {
      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain(config.characterPersona);
      expect(systemPrompt).toContain('キャラクター');
    });

    it('should include tone instructions', () => {
      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('フレンドリー'); // 'friendly'は日本語で表示
      expect(systemPrompt).toContain('口調');
    });

    it('should include length constraints', () => {
      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('20');
      expect(systemPrompt).toContain('60');
      expect(systemPrompt).toContain('文字');
    });

    it('should include NG word warnings', () => {
      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('使用禁止');
      expect(systemPrompt).toContain('NG語');
      config.ngWords.forEach((word) => {
        expect(systemPrompt).toContain(word);
      });
    });

    it('should include emoji policy', () => {
      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('絵文字');
      expect(systemPrompt).toContain('1個まで');
      expect(systemPrompt).toContain('使用できる絵文字'); // '許可された'ではなく'使用できる'
    });

    it('should include encouraged expressions', () => {
      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('推奨表現');
      config.encouragedExpressions.forEach((expr) => {
        expect(systemPrompt).toContain(expr);
      });
    });

    it('should handle disabled emoji policy', () => {
      config.emojiPolicy.enabled = false;
      prompt = new CommentGenerationPrompt(config);

      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('絵文字は使用しない');
    });
  });

  describe('formatUserPrompt', () => {
    it('should format context into user prompt', () => {
      const context = {
        recentTopics: ['ゲーム実況', 'RPG'],
        keywords: ['レベルアップ', 'ボス戦'],
        transcript: '今からボス戦に挑戦します！レベルは50です。',
        chatHistory: [],
      };

      const userPrompt = prompt.formatUserPrompt(context);

      expect(userPrompt).toContain('ゲーム実況');
      expect(userPrompt).toContain('RPG');
      expect(userPrompt).toContain('レベルアップ');
      expect(userPrompt).toContain('ボス戦');
      expect(userPrompt).toContain('今からボス戦に挑戦します');
    });

    it('should include recent comments in context', () => {
      const context = {
        recentTopics: [],
        keywords: [],
        transcript: 'テスト配信中',
        chatHistory: [
          { author: '視聴者A', message: '頑張って！', timestamp: Date.now() - 5000 },
          { author: '視聴者B', message: '応援してます', timestamp: Date.now() - 3000 },
        ],
      };

      const userPrompt = prompt.formatUserPrompt(context);

      expect(userPrompt).toContain('最近のコメント');
      expect(userPrompt).toContain('頑張って！');
      expect(userPrompt).toContain('応援してます');
    });

    it('should handle empty context gracefully', () => {
      const context = {
        recentTopics: [],
        keywords: [],
        transcript: '',
        chatHistory: [],
      };

      const userPrompt = prompt.formatUserPrompt(context);

      expect(userPrompt).toBeTruthy();
      expect(userPrompt).toContain('配信');
    });
  });

  describe('formatExamples', () => {
    it('should provide relevant examples based on config', () => {
      const examples = prompt.formatExamples();

      expect(examples).toContain('例:');
      expect(examples).toContain('なるほど'); // 推奨表現
      expect(examples.split('\n').length).toBeGreaterThan(3); // 複数の例を含む
    });

    it('should include emoji in examples when enabled', () => {
      const examples = prompt.formatExamples();

      // 許可された絵文字のいずれかが含まれているか
      const hasAllowedEmoji = config.emojiPolicy.allowedEmojis.some((emoji) =>
        examples.includes(emoji)
      );
      expect(hasAllowedEmoji).toBe(true);
    });

    it('should not include emoji when disabled', () => {
      config.emojiPolicy.enabled = false;
      prompt = new CommentGenerationPrompt(config);

      const examples = prompt.formatExamples();

      // どの絵文字も含まれていないか
      const hasAnyEmoji =
        /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]/u.test(
          examples
        );
      expect(hasAnyEmoji).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update prompts when config changes', () => {
      const newConfig: CommentConfig = {
        ...config,
        tone: 'enthusiastic',
        characterPersona: '熱心なファン',
        targetLength: { min: 30, max: 80 },
      };

      prompt.updateConfig(newConfig);
      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('熱心'); // 'enthusiastic'は日本語で表示
      expect(systemPrompt).toContain('熱心なファン');
      expect(systemPrompt).toContain('30');
      expect(systemPrompt).toContain('80');
    });
  });

  describe('tone variations', () => {
    it('should adapt prompt for formal tone', () => {
      config.tone = 'formal';
      prompt = new CommentGenerationPrompt(config);

      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('丁寧');
      expect(systemPrompt).toContain('です・ます');
    });

    it('should adapt prompt for casual tone', () => {
      config.tone = 'casual';
      prompt = new CommentGenerationPrompt(config);

      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('カジュアル');
      expect(systemPrompt).toContain('友達');
    });

    it('should adapt prompt for enthusiastic tone', () => {
      config.tone = 'enthusiastic';
      prompt = new CommentGenerationPrompt(config);

      const systemPrompt = prompt.generateSystemPrompt();

      expect(systemPrompt).toContain('熱心');
      expect(systemPrompt).toContain('感動');
      expect(systemPrompt).toContain('！');
    });
  });
});
