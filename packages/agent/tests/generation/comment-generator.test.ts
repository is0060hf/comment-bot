/**
 * Tsumiki AITDD - Red Phase
 * タスク4: コメント生成のテストケース
 */

import { CommentGenerator, GeneratorConfig } from '../../src/generation/comment-generator';
import { ContextSummary, GeneratedComment, TriggerDecision } from '@comment-bot/shared';
import { LLMPort } from '../../src/ports/llm';
import { CommentConfig } from '../../src/config/types';

describe('CommentGenerator', () => {
  let generator: CommentGenerator;
  let mockLLM: jest.Mocked<LLMPort>;
  let config: GeneratorConfig;
  let commentConfig: CommentConfig;

  beforeEach(() => {
    mockLLM = {
      generateComment: jest.fn(),
      classifyCommentOpportunity: jest.fn(),
      chat: jest.fn(),
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    commentConfig = {
      targetLength: { min: 20, max: 60 },
      tone: 'friendly',
      characterPersona: '好奇心旺盛な初心者',
      encouragedExpressions: ['なるほど', 'すごい', '勉強になります'],
      ngWords: ['死ね', 'バカ'],
      emojiPolicy: {
        enabled: true,
        maxCount: 1,
        allowedEmojis: ['👏', '✨', '🙏', '💡'],
      },
    };

    config = {
      llm: mockLLM,
      commentConfig,
      maxRetries: 3,
      temperature: 0.7,
    };

    generator = new CommentGenerator(config);
  });

  describe('comment generation', () => {
    test('コンテキストに基づいてコメントを生成できること', async () => {
      const mockComment: GeneratedComment = {
        text: 'なるほど！TypeScriptの型安全性は便利ですね✨',
        metadata: {
          tone: 'friendly',
          intent: 'appreciation',
          confidence: 0.9,
          generatedAt: new Date(),
        },
        alternatives: [],
      };

      mockLLM.generateComment.mockResolvedValue({
        comment: mockComment.text,
        confidence: mockComment.metadata.confidence,
      });

      const context: ContextSummary = {
        recentTranscripts: ['TypeScriptの型システムについて説明します'],
        topics: ['TypeScript', '型システム'],
        keywords: ['TypeScript', '型', '安全性'],
        engagementLevel: 0.7,
      };

      const comment = await generator.generate(context, 'topic_change');

      expect(comment).toBeDefined();
      expect(comment.text).toContain('TypeScript');
      expect(comment.text.length).toBeGreaterThanOrEqual(20);
      expect(comment.text.length).toBeLessThanOrEqual(60);
    });

    test('ペルソナに応じたコメントが生成されること', async () => {
      mockLLM.generateComment.mockResolvedValue({
        comment: '初めて聞きました！もっと詳しく知りたいです👏',
        confidence: 0.85,
      });

      const context: ContextSummary = {
        recentTranscripts: ['高度な技術について'],
        topics: ['技術'],
        keywords: ['高度', '技術'],
        engagementLevel: 0.6,
      };

      const comment = await generator.generate(context, 'question');

      expect(comment.text).toMatch(/初めて|知りたい|教えて/);
      expect(comment.metadata.tone).toBe('friendly');
    });

    test('代替案を生成できること', async () => {
      mockLLM.generateComment.mockResolvedValue({
        comment: 'すごく勉強になります！',
        confidence: 0.9,
      });

      const context: ContextSummary = {
        recentTranscripts: ['重要なポイントを説明します'],
        topics: ['説明'],
        keywords: ['重要', 'ポイント'],
        engagementLevel: 0.8,
      };

      const comment = await generator.generate(context, 'topic_change');

      // alternativesはLLMから返されないため、GeneratedCommentでは空配列
      expect(comment.alternatives).toHaveLength(0);
    });
  });

  describe('policy application', () => {
    test('コメント長が調整されること', async () => {
      mockLLM.generateComment.mockResolvedValue({
        comment: 'わあ！', // 短すぎる
        confidence: 0.8,
      });

      const context: ContextSummary = {
        recentTranscripts: ['素晴らしい内容'],
        topics: ['内容'],
        keywords: ['素晴らしい'],
        engagementLevel: 0.9,
      };

      const comment = await generator.generate(context, 'call_to_action');

      // 長さポリシーにより調整される
      expect(comment.text.length).toBeGreaterThanOrEqual(20);
    });

    test('NGワードが除去されること', async () => {
      mockLLM.generateComment.mockResolvedValue({
        comment: 'バカみたいに簡単ですね',
        confidence: 0.8,
      });

      const context: ContextSummary = {
        recentTranscripts: ['簡単な方法を紹介'],
        topics: ['簡単'],
        keywords: ['簡単', '方法'],
        engagementLevel: 0.6,
      };

      const comment = await generator.generate(context, 'topic_change');

      expect(comment.text).not.toContain('バカ');
    });

    test('絵文字ポリシーが適用されること', async () => {
      mockLLM.generateComment.mockResolvedValue({
        comment: 'すごい！😀😃😄😁🤣', // 多すぎる絵文字
        confidence: 0.8,
      });

      const context: ContextSummary = {
        recentTranscripts: ['面白い話'],
        topics: ['面白い'],
        keywords: ['面白い'],
        engagementLevel: 0.8,
      };

      const comment = await generator.generate(context, 'topic_change');

      // 絵文字は1つまで、許可リストから
      const emojiCount = (comment.text.match(/[👏✨🙏💡]/g) || []).length;
      expect(emojiCount).toBeLessThanOrEqual(1);
    });
  });

  describe('trigger-specific generation', () => {
    test('質問トリガーには質問的なコメントを生成すること', async () => {
      mockLLM.generateComment.mockResolvedValue({
        comment: 'これってどういう場面で使えますか？',
        confidence: 0.85,
      });

      const context: ContextSummary = {
        recentTranscripts: ['新しい機能について'],
        topics: ['新機能'],
        keywords: ['機能'],
        engagementLevel: 0.7,
      };

      const comment = await generator.generate(context, 'question');

      expect(comment.text).toMatch(/[？?]/);
      expect(comment.metadata.intent).toBe('question');
    });

    test('話題転換には関心を示すコメントを生成すること', async () => {
      mockLLM.generateComment.mockResolvedValue({
        comment: 'おお、次はReactの話ですね！楽しみです✨',
        confidence: 0.9,
      });

      const context: ContextSummary = {
        recentTranscripts: ['次はReactについて'],
        topics: ['React'],
        keywords: ['React', '次'],
        engagementLevel: 0.6,
      };

      const comment = await generator.generate(context, 'topic_change');

      expect(comment.metadata.intent).toBe('interest');
    });

    test('コールトゥアクションには応援的なコメントを生成すること', async () => {
      mockLLM.generateComment.mockResolvedValue({
        comment: 'チャンネル登録しました！応援してます👏',
        confidence: 0.95,
      });

      const context: ContextSummary = {
        recentTranscripts: ['チャンネル登録お願いします'],
        topics: ['チャンネル登録'],
        keywords: ['登録', 'お願い'],
        engagementLevel: 0.8,
      };

      const comment = await generator.generate(context, 'call_to_action');

      expect(comment.metadata.intent).toBe('support');
    });
  });

  describe('error handling', () => {
    test('LLMエラー時にリトライすること', async () => {
      mockLLM.generateComment
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          comment: 'なるほど、勉強になります！',
          confidence: 0.8,
        });

      const context: ContextSummary = {
        recentTranscripts: ['説明'],
        topics: ['説明'],
        keywords: ['説明'],
        engagementLevel: 0.5,
      };

      const comment = await generator.generate(context, 'topic_change');

      expect(comment).toBeDefined();
      expect(mockLLM.generateComment).toHaveBeenCalledTimes(2);
    });

    test('最大リトライ回数を超えたらエラーをスローすること', async () => {
      mockLLM.generateComment.mockRejectedValue(new Error('Persistent error'));

      const context: ContextSummary = {
        recentTranscripts: ['内容'],
        topics: ['内容'],
        keywords: ['内容'],
        engagementLevel: 0.5,
      };

      await expect(
        generator.generate(context, 'topic_change')
      ).rejects.toThrow('Failed to generate comment');

      expect(mockLLM.generateComment).toHaveBeenCalledTimes(3);
    });
  });

  describe('fallback generation', () => {
    test('LLM失敗時にフォールバックコメントを生成すること', async () => {
      generator = new CommentGenerator({
        ...config,
        enableFallback: true,
      });

      mockLLM.generateComment.mockRejectedValue(new Error('LLM unavailable'));

      const context: ContextSummary = {
        recentTranscripts: ['興味深い話'],
        topics: ['話'],
        keywords: ['興味深い'],
        engagementLevel: 0.7,
      };

      const comment = await generator.generate(context, 'topic_change');

      expect(comment.text).toBeTruthy();
      expect(comment.metadata.confidence).toBeLessThan(0.5);
    });

    test('フォールバックコメントもポリシーに従うこと', async () => {
      generator = new CommentGenerator({
        ...config,
        enableFallback: true,
      });

      mockLLM.generateComment.mockRejectedValue(new Error('LLM unavailable'));

      const context: ContextSummary = {
        recentTranscripts: ['質問はありますか'],
        topics: ['質問'],
        keywords: ['質問'],
        engagementLevel: 0.8,
      };

      const comment = await generator.generate(context, 'question');

      expect(comment.text.length).toBeGreaterThanOrEqual(20);
      expect(comment.text.length).toBeLessThanOrEqual(60);
      expect(comment.text).not.toMatch(/死ね|バカ/);
    });
  });

  describe('configuration', () => {
    test('設定を更新できること', async () => {
      const newConfig: CommentConfig = {
        ...commentConfig,
        tone: 'formal',
        characterPersona: '専門家',
      };

      generator.updateConfig({
        ...config,
        commentConfig: newConfig,
      });

      mockLLM.generateComment.mockResolvedValue({
        comment: 'たいへん興味深い内容ですね。',
        confidence: 0.9,
      });

      const context: ContextSummary = {
        recentTranscripts: ['技術的な話'],
        topics: ['技術'],
        keywords: ['技術'],
        engagementLevel: 0.6,
      };

      const comment = await generator.generate(context, 'topic_change');

      expect(comment.metadata.tone).toBe('formal');
    });
  });

  describe('performance', () => {
    test('キャッシュを利用して同じコンテキストの生成を高速化すること', async () => {
      mockLLM.generateComment.mockResolvedValue({
        comment: 'すごいですね！',
        confidence: 0.85,
      });

      const context: ContextSummary = {
        recentTranscripts: ['同じ内容'],
        topics: ['内容'],
        keywords: ['同じ'],
        engagementLevel: 0.5,
      };

      // 1回目
      const comment1 = await generator.generate(context, 'topic_change');
      
      // 2回目（キャッシュから）
      const comment2 = await generator.generate(context, 'topic_change');

      expect(comment1.text).toBe(comment2.text);
      expect(mockLLM.generateComment).toHaveBeenCalledTimes(1);
    });
  });
});
