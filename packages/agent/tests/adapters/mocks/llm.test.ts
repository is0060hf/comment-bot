import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockLLMAdapter } from '../../../src/adapters/mocks/llm';
import { LLMPort, LLMMessage, LLMError, CommentClassification } from '../../../src/ports/llm';

describe('MockLLMAdapter', () => {
  let adapter: MockLLMAdapter;

  beforeEach(() => {
    adapter = new MockLLMAdapter();
  });

  describe('generateComment', () => {
    it('should generate comment based on context', async () => {
      const context = {
        recentTopics: ['新機能', 'アップデート', '使い方'],
        keywords: ['便利', '簡単', '素晴らしい'],
        streamTitle: 'テスト配信',
        policy: {
          tone: 'friendly',
          characterPersona: '好奇心旺盛な初心者',
          encouragedExpressions: ['なるほど', 'すごい'],
          targetLength: { min: 20, max: 60 }
        }
      };

      const result = await adapter.generateComment(context);

      expect(result).toHaveProperty('comment');
      expect(result.comment.length).toBeGreaterThanOrEqual(20);
      expect(result.comment.length).toBeLessThanOrEqual(60);
      expect(result).toHaveProperty('confidence');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should respect character persona in generated comments', async () => {
      const context = {
        recentTopics: ['プログラミング'],
        keywords: ['Python', 'JavaScript'],
        streamTitle: 'プログラミング講座',
        policy: {
          tone: 'professional',
          characterPersona: 'エンジニア',
          encouragedExpressions: ['実装', '設計', 'アーキテクチャ'],
          targetLength: { min: 20, max: 60 }
        }
      };

      const result = await adapter.generateComment(context);

      expect(result.comment).toMatch(/実装|設計|アーキテクチャ|エンジニア|技術/);
    });

    it('should handle API failures', async () => {
      const failingAdapter = new MockLLMAdapter({ failureRate: 1.0 });
      const context = {
        recentTopics: ['test'],
        keywords: ['test'],
        streamTitle: 'test',
        policy: {
          tone: 'friendly',
          characterPersona: 'test',
          encouragedExpressions: [],
          targetLength: { min: 20, max: 60 }
        }
      };

      await expect(failingAdapter.generateComment(context)).rejects.toThrow(LLMError);
    });
  });

  describe('classifyCommentOpportunity', () => {
    it('should classify high-opportunity moments', async () => {
      const context = {
        transcript: '皆さん、どう思いますか？コメントで教えてください！',
        recentTopics: ['質問', '意見募集'],
        engagementLevel: 0.8
      };

      const result = await adapter.classifyCommentOpportunity(context);

      expect(result.classification).toBe('necessary');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify low-opportunity moments', async () => {
      const context = {
        transcript: 'それでは次のスライドに移ります...',
        recentTopics: ['説明', '解説'],
        engagementLevel: 0.3
      };

      const result = await adapter.classifyCommentOpportunity(context);

      expect(result.classification).toBe('unnecessary');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify ambiguous moments as hold', async () => {
      const context = {
        transcript: 'これについては後ほど詳しく説明しますが...',
        recentTopics: ['予告', '準備'],
        engagementLevel: 0.5
      };

      const result = await adapter.classifyCommentOpportunity(context);

      expect(result.classification).toBe('hold');
    });
  });

  describe('chat', () => {
    it('should handle chat conversation', async () => {
      const messages: LLMMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, how are you?' }
      ];

      const result = await adapter.chat(messages);

      expect(result).toHaveProperty('message');
      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBeTruthy();
      expect(result).toHaveProperty('usage');
      expect(result.usage.promptTokens).toBeGreaterThan(0);
      expect(result.usage.completionTokens).toBeGreaterThan(0);
    });
  });

  describe('isHealthy', () => {
    it('should return health status', async () => {
      const health = await adapter.isHealthy();
      expect(health).toBe(true);
    });

    it('should return false when configured unhealthy', async () => {
      const unhealthyAdapter = new MockLLMAdapter({ healthy: false });
      const health = await unhealthyAdapter.isHealthy();
      expect(health).toBe(false);
    });
  });
});
