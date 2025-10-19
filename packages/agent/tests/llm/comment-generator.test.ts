/**
 * コメント生成のテスト
 * LLMを使用したコメント生成機能のテスト
 */

import { CommentGenerator } from '../../src/llm/comment-generator';
import { CommentGenerationContext } from '../../src/ports/llm';
import { CommentConfig } from '../../src/config/types';

describe('CommentGenerator', () => {
  let generator: CommentGenerator;
  let mockLLMAdapter: any;
  let commentConfig: CommentConfig;

  beforeEach(() => {
    mockLLMAdapter = {
      generateComment: jest.fn().mockResolvedValue({
        comment: 'いいですね！✨',
        confidence: 0.9,
        reasoning: 'ポジティブな反応が適切'
      }),
      isHealthy: jest.fn().mockResolvedValue(true)
    };

    commentConfig = {
      targetLength: { min: 20, max: 60 },
      tone: 'friendly',
      characterPersona: '親しみやすく、前向きなコメントをする',
      encouragedExpressions: ['なるほど', 'いいですね', 'すごい'],
      ngWords: ['禁止ワード', 'NG'],
      emojiPolicy: {
        enabled: true,
        maxCount: 1,
        allowedEmojis: ['👏', '✨', '🙏', '💡']
      }
    };

    generator = new CommentGenerator({
      llmAdapter: mockLLMAdapter,
      commentConfig
    });
  });

  describe('基本的なコメント生成', () => {
    it('コンテキストに基づいてコメントを生成できること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: ['プログラミング', 'TypeScript'],
        keywords: ['楽しい', '好き'],
        streamTitle: 'プログラミング配信',
        policy: {
          tone: 'friendly',
          characterPersona: '親しみやすい',
          encouragedExpressions: ['なるほど'],
          targetLength: { min: 20, max: 60 }
        }
      };

      const result = await generator.generate(context);

      expect(result.comment).toBeTruthy();
      expect(result.comment.length).toBeGreaterThanOrEqual(20);
      expect(result.comment.length).toBeLessThanOrEqual(60);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('ペルソナ設定が反映されたコメントを生成すること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: ['学習', '技術'],
        keywords: ['新しい', '学ぶ'],
        streamTitle: '技術学習配信',
        policy: {
          tone: 'friendly',
          characterPersona: commentConfig.characterPersona,
          encouragedExpressions: commentConfig.encouragedExpressions,
          targetLength: commentConfig.targetLength
        }
      };

      await generator.generate(context);

      expect(mockLLMAdapter.generateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          policy: expect.objectContaining({
            characterPersona: expect.stringContaining('親しみやすく')
          })
        })
      );
    });
  });

  describe('文字数制限の適用', () => {
    it('生成されたコメントが短すぎる場合、拡張すること', async () => {
      mockLLMAdapter.generateComment.mockResolvedValueOnce({
        comment: 'いいね',
        confidence: 0.8
      });

      const context: CommentGenerationContext = {
        recentTopics: ['感想'],
        keywords: ['素晴らしい'],
        streamTitle: '配信',
        policy: {
          tone: 'friendly',
          characterPersona: commentConfig.characterPersona,
          encouragedExpressions: commentConfig.encouragedExpressions,
          targetLength: commentConfig.targetLength
        }
      };

      const result = await generator.generate(context);

      expect(result.comment.length).toBeGreaterThanOrEqual(20);
      expect(result.wasAdjusted).toBe(true);
      expect(result.adjustmentReason).toContain('extended');
    });

    it('生成されたコメントが長すぎる場合、短縮すること', async () => {
      mockLLMAdapter.generateComment.mockResolvedValueOnce({
        comment: 'これは本当に素晴らしい内容で、私も同じような経験があります。特に印象的だったのは最後の部分で、とても共感できました。',
        confidence: 0.9
      });

      const result = await generator.generate({} as CommentGenerationContext);

      expect(result.comment.length).toBeLessThanOrEqual(60);
      expect(result.wasAdjusted).toBe(true);
      expect(result.adjustmentReason).toContain('truncated');
    });
  });

  describe('NGワード処理', () => {
    it('NGワードが含まれる場合、除去すること', async () => {
      mockLLMAdapter.generateComment.mockResolvedValueOnce({
        comment: 'これは禁止ワードを含むコメントです',
        confidence: 0.8
      });

      const result = await generator.generate({} as CommentGenerationContext);

      expect(result.comment).not.toContain('禁止ワード');
      expect(result.wasAdjusted).toBe(true);
      expect(result.adjustmentReason).toContain('ng_words_removed');
    });

    it('NGワード除去後に短くなりすぎた場合、再生成すること', async () => {
      mockLLMAdapter.generateComment
        .mockResolvedValueOnce({
          comment: '禁止ワード',
          confidence: 0.8
        })
        .mockResolvedValueOnce({
          comment: 'クリーンなコメントです！',
          confidence: 0.9
        });

      const result = await generator.generate({} as CommentGenerationContext);

      expect(result.comment).toBe('クリーンなコメントです！');
      expect(mockLLMAdapter.generateComment).toHaveBeenCalledTimes(2);
    });
  });

  describe('絵文字処理', () => {
    it('絵文字が多すぎる場合、制限すること', async () => {
      mockLLMAdapter.generateComment.mockResolvedValueOnce({
        comment: 'すごい！👏✨🎉💡素晴らしい！',
        confidence: 0.9
      });

      const result = await generator.generate({} as CommentGenerationContext);

      // 絵文字は1つまでに制限される
      const emojiCount = (result.comment.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
      expect(emojiCount).toBeLessThanOrEqual(1);
    });

    it('絵文字無効設定の場合、絵文字を除去すること', async () => {
      generator = new CommentGenerator({
        llmAdapter: mockLLMAdapter,
        commentConfig: { 
          ...commentConfig, 
          emojiPolicy: { ...commentConfig.emojiPolicy, enabled: false } 
        }
      });

      mockLLMAdapter.generateComment.mockResolvedValueOnce({
        comment: 'いいですね！✨',
        confidence: 0.9
      });

      const result = await generator.generate({} as CommentGenerationContext);

      expect(result.comment).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    });
  });

  describe('フォールバック処理', () => {
    it('LLMが失敗した場合、定型文から選択すること', async () => {
      mockLLMAdapter.generateComment.mockRejectedValueOnce(new Error('LLM error'));

      const result = await generator.generate({} as CommentGenerationContext);

      expect(result.comment).toMatch(/なるほど|いいですね|すごい/);
      expect(result.isTemplate).toBe(true);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('コンテキストに応じて適切な定型文を選択すること', async () => {
      mockLLMAdapter.generateComment.mockRejectedValueOnce(new Error('LLM error'));

      const context: CommentGenerationContext = {
        recentTopics: ['質問'],
        keywords: ['質問'],
        streamTitle: '配信',
        policy: {
          tone: 'friendly',
          characterPersona: commentConfig.characterPersona,
          encouragedExpressions: commentConfig.encouragedExpressions,
          targetLength: commentConfig.targetLength
        }
      };

      const result = await generator.generate(context);

      // 質問に対する適切な定型文が選ばれる
      expect(result.comment).toMatch(/なるほど|確かに|そうですね/);
    });
  });

  describe('再試行とキャッシュ', () => {
    it('同じコンテキストで短時間に複数回生成する場合、バリエーションを持たせること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: ['test'],
        keywords: ['同じ'],
        streamTitle: '配信',
        policy: {
          tone: 'friendly',
          characterPersona: commentConfig.characterPersona,
          encouragedExpressions: commentConfig.encouragedExpressions,
          targetLength: commentConfig.targetLength
        }
      };

      mockLLMAdapter.generateComment
        .mockResolvedValueOnce({ comment: 'コメント1', confidence: 0.8 })
        .mockResolvedValueOnce({ comment: 'コメント2', confidence: 0.8 });

      const result1 = await generator.generate(context);
      const result2 = await generator.generate(context);

      expect(result1.comment).not.toBe(result2.comment);
    });

    it('最近使用したコメントと類似している場合、再生成すること', async () => {
      generator.recordUsedComment('なるほど、いいですね！');

      mockLLMAdapter.generateComment
        .mockResolvedValueOnce({ comment: 'なるほど、いいですね！', confidence: 0.8 })
        .mockResolvedValueOnce({ comment: 'すごい発見ですね！', confidence: 0.8 });

      const result = await generator.generate({} as CommentGenerationContext);

      expect(result.comment).toBe('すごい発見ですね！');
      expect(mockLLMAdapter.generateComment).toHaveBeenCalledTimes(2);
    });
  });

  describe('設定の更新', () => {
    it('コメント設定を動的に更新できること', async () => {
      const newConfig: CommentConfig = {
        ...commentConfig,
        targetLength: { min: 10, max: 30 },
        tone: 'casual',
        emojiPolicy: { ...commentConfig.emojiPolicy, enabled: false }
      };

      generator.updateConfig(newConfig);

      mockLLMAdapter.generateComment.mockResolvedValueOnce({
        comment: 'これは新しい設定での生成結果です！絵文字なし',
        confidence: 0.9
      });

      const result = await generator.generate({} as CommentGenerationContext);

      expect(result.comment.length).toBeLessThanOrEqual(30);
      expect(mockLLMAdapter.generateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          policy: expect.objectContaining({
            targetLength: 30,
            tone: 'casual',
            includeEmoji: false
          })
        })
      );
    });
  });
});
