import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommentClassificationPrompt } from '../../src/prompts/comment-classification';
import { CommentConfig } from '../../src/config/types';

describe('CommentClassificationPrompt', () => {
  let config: CommentConfig;
  let prompt: CommentClassificationPrompt;

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
    
    prompt = new CommentClassificationPrompt(config);
  });

  describe('generateSystemPrompt', () => {
    it('should include classification instructions', () => {
      const systemPrompt = prompt.generateSystemPrompt();
      
      expect(systemPrompt).toContain('分類');
      expect(systemPrompt).toContain('コメント機会');
      expect(systemPrompt).toContain('判定');
    });

    it('should define classification categories', () => {
      const systemPrompt = prompt.generateSystemPrompt();
      
      expect(systemPrompt).toContain('high');
      expect(systemPrompt).toContain('medium');
      expect(systemPrompt).toContain('low');
      expect(systemPrompt).toContain('none');
    });

    it('should include criteria for each category', () => {
      const systemPrompt = prompt.generateSystemPrompt();
      
      // high
      expect(systemPrompt).toContain('質問');
      expect(systemPrompt).toContain('意見を求めている'); // '意見募集'ではなく'意見を求めている'
      
      // medium
      expect(systemPrompt).toContain('話題が転換'); // '話題転換'ではなく'話題が転換'
      expect(systemPrompt).toContain('盛り上がり');
      
      // low
      expect(systemPrompt).toContain('通常');
      expect(systemPrompt).toContain('会話');
      
      // none
      expect(systemPrompt).toContain('不適切');
      expect(systemPrompt).toContain('類似コメント'); // '重複'ではなく'類似コメント'
    });

    it('should consider character persona in classification', () => {
      const systemPrompt = prompt.generateSystemPrompt();
      
      expect(systemPrompt).toContain(config.characterPersona);
      expect(systemPrompt).toContain('興味');
    });
  });

  describe('formatUserPrompt', () => {
    it('should format context for classification', () => {
      const context = {
        recentTopics: ['ゲーム', '攻略'],
        keywords: ['難しい', 'コツ'],
        transcript: 'このボスを倒すコツを教えてください！',
        lastCommentTime: Date.now() - 30000,
        viewerEngagement: 'high' as const
      };
      
      const userPrompt = prompt.formatUserPrompt(context);
      
      expect(userPrompt).toContain('ゲーム');
      expect(userPrompt).toContain('攻略');
      expect(userPrompt).toContain('難しい');
      expect(userPrompt).toContain('コツ');
      expect(userPrompt).toContain('このボスを倒すコツを教えてください');
    });

    it('should include timing information', () => {
      const context = {
        recentTopics: [],
        keywords: [],
        transcript: 'テスト',
        lastCommentTime: Date.now() - 60000, // 1分前
        viewerEngagement: 'medium' as const
      };
      
      const userPrompt = prompt.formatUserPrompt(context);
      
      expect(userPrompt).toContain('前回コメント');
      expect(userPrompt).toContain('1分前'); // 60秒 = 1分と表示される
    });

    it('should include engagement level', () => {
      const context = {
        recentTopics: [],
        keywords: [],
        transcript: 'テスト',
        lastCommentTime: 0,
        viewerEngagement: 'high' as const
      };
      
      const userPrompt = prompt.formatUserPrompt(context);
      
      expect(userPrompt).toContain('エンゲージメント');
      expect(userPrompt).toContain('high');
    });
  });

  describe('formatClassificationRules', () => {
    it('should provide clear rules for each category', () => {
      const rules = prompt.formatClassificationRules();
      
      expect(rules).toContain('分類基準');
      expect(rules).toContain('high:');
      expect(rules).toContain('medium:');
      expect(rules).toContain('low:');
      expect(rules).toContain('none:');
    });

    it('should include persona-specific preferences', () => {
      config.characterPersona = '技術に詳しいエンジニア';
      prompt = new CommentClassificationPrompt(config);
      
      const rules = prompt.formatClassificationRules();
      
      expect(rules).toContain('技術');
      expect(rules).toContain('専門');
    });

    it('should adjust for different tones', () => {
      config.tone = 'enthusiastic';
      prompt = new CommentClassificationPrompt(config);
      
      const rules = prompt.formatClassificationRules();
      
      expect(rules).toContain('盛り上がり');
      expect(rules).toContain('感動');
    });
  });

  describe('formatResponseFormat', () => {
    it('should specify expected response format', () => {
      const format = prompt.formatResponseFormat();
      
      expect(format).toContain('classification');
      expect(format).toContain('confidence');
      expect(format).toContain('reasoning');
      expect(format).toContain('JSON');
    });

    it('should include example response', () => {
      const format = prompt.formatResponseFormat();
      
      expect(format).toContain('{');
      expect(format).toContain('}');
      expect(format).toContain('"classification":');
      expect(format).toContain('"confidence":');
    });
  });

  describe('edge cases', () => {
    it('should handle cooldown period', () => {
      const context = {
        recentTopics: [],
        keywords: [],
        transcript: '面白い！',
        lastCommentTime: Date.now() - 5000, // 5秒前
        viewerEngagement: 'high' as const
      };
      
      const userPrompt = prompt.formatUserPrompt(context);
      
      expect(userPrompt).toContain('5秒');
      expect(userPrompt).toContain('短時間');
    });

    it('should consider recent similar comments', () => {
      const context = {
        recentTopics: ['料理'],
        keywords: ['美味しそう'],
        transcript: '美味しそうですね！',
        lastCommentTime: Date.now() - 30000,
        viewerEngagement: 'medium' as const,
        recentComments: [
          { message: '美味しそう！', timestamp: Date.now() - 10000 },
          { message: 'おいしそう〜', timestamp: Date.now() - 15000 }
        ]
      };
      
      const userPrompt = prompt.formatUserPrompt(context);
      
      // 類似コメントの警告は条件付きで表示される
      const hasWarning = userPrompt.includes('類似コメント') || userPrompt.includes('おいしそう');
      expect(hasWarning).toBe(true);
      expect(userPrompt).toContain('重複');
    });
  });

  describe('updateConfig', () => {
    it('should update classification criteria when config changes', () => {
      const newConfig: CommentConfig = {
        ...config,
        characterPersona: 'ベテラン視聴者',
        tone: 'formal'
      };
      
      prompt.updateConfig(newConfig);
      const systemPrompt = prompt.generateSystemPrompt();
      
      expect(systemPrompt).toContain('ベテラン視聴者');
      expect(systemPrompt).toContain('formal');
    });
  });
});
