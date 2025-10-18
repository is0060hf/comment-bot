/**
 * Tsumiki AITDD - Red Phase
 * タスク4: トリガー検出のテストケース
 */

import { TriggerDetector, TriggerConfig } from '../../src/trigger/trigger-detector';
import { TriggerDecision } from '@comment-bot/shared';
import { ContextSummary } from '@comment-bot/shared';
import { LLMPort } from '../../src/ports/llm';

describe('TriggerDetector', () => {
  let detector: TriggerDetector;
  let mockLLM: jest.Mocked<LLMPort>;
  let config: TriggerConfig;

  beforeEach(() => {
    mockLLM = {
      generateComment: jest.fn(),
      classifyCommentOpportunity: jest.fn(),
      chat: jest.fn(),
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    config = {
      llm: mockLLM,
      minInterval: 30000, // 30秒
      maxInterval: 180000, // 3分
      rules: {
        questionTrigger: true,
        topicChangeTrigger: true,
        callToActionTrigger: true,
        silenceTrigger: true,
        silenceThresholdMs: 60000, // 1分
      },
      confidence: {
        ruleBasedThreshold: 0.7,
        llmThreshold: 0.8,
      },
    };

    detector = new TriggerDetector(config);
  });

  describe('rule-based triggers', () => {
    test('質問を検出できること', async () => {
      const context: ContextSummary = {
        recentTranscripts: [
          'それでは質問はありますか？',
          'コメントで教えてください',
        ],
        topics: ['プログラミング'],
        keywords: ['質問', 'コメント'],
        engagementLevel: 0.7,
      };

      const decision = await detector.evaluate(context);

      expect(decision.shouldComment).toBe(true);
      expect(decision.reason).toContain('question');
      expect(decision.confidence).toBeGreaterThanOrEqual(0.7);
      expect(decision.triggerType).toBe('question');
    });

    test('話題転換を検出できること', async () => {
      const context: ContextSummary = {
        recentTranscripts: [
          '今までPythonの話をしていましたが',
          '次はJavaScriptについて説明します',
        ],
        topics: ['Python', 'JavaScript'],
        keywords: ['Python', 'JavaScript', '次は'],
        engagementLevel: 0.6,
      };

      const decision = await detector.evaluate(context);

      expect(decision.shouldComment).toBe(true);
      expect(decision.triggerType).toBe('topic_change');
    });

    test('コールトゥアクションを検出できること', async () => {
      const context: ContextSummary = {
        recentTranscripts: [
          'ぜひチャンネル登録お願いします',
          'コメントもお待ちしています',
        ],
        topics: ['チャンネル登録'],
        keywords: ['チャンネル登録', 'コメント', 'お願い'],
        engagementLevel: 0.8,
      };

      const decision = await detector.evaluate(context);

      expect(decision.shouldComment).toBe(true);
      expect(decision.triggerType).toBe('call_to_action');
    });

    test('沈黙を検出できること', async () => {
      const lastCommentTime = Date.now() - 70000; // 70秒前
      detector.setLastCommentTime(lastCommentTime);

      const context: ContextSummary = {
        recentTranscripts: ['静かに作業を続けています'],
        topics: ['作業'],
        keywords: ['作業'],
        engagementLevel: 0.3,
      };

      const decision = await detector.evaluate(context);

      expect(decision.shouldComment).toBe(true);
      expect(decision.triggerType).toBe('timing');
      expect(decision.reason).toContain('silence');
    });
  });

  describe('LLM-based triggers', () => {
    test('LLMでコメント機会を分類できること', async () => {
      mockLLM.classifyCommentOpportunity.mockResolvedValue({
        classification: 'necessary',
        confidence: 0.9,
        reason: 'Streamer asked a direct question to viewers',
      });

      const context: ContextSummary = {
        recentTranscripts: ['みなさんはどう思いますか？'],
        topics: ['意見募集'],
        keywords: ['みなさん', '思いますか'],
        engagementLevel: 0.8,
      };

      const decision = await detector.evaluate(context);

      expect(decision.shouldComment).toBe(true);
      expect(decision.confidence).toBe(0.9);
      expect(mockLLM.classifyCommentOpportunity).toHaveBeenCalled();
    });

    test('LLMが不要と判断した場合はコメントしないこと', async () => {
      mockLLM.classifyCommentOpportunity.mockResolvedValue({
        classification: 'unnecessary',
        confidence: 0.95,
        reason: 'Streamer is in the middle of explanation',
      });

      const context: ContextSummary = {
        recentTranscripts: ['詳しく説明していきます'],
        topics: ['説明'],
        keywords: ['説明'],
        engagementLevel: 0.5,
      };

      const decision = await detector.evaluate(context);

      expect(decision.shouldComment).toBe(false);
      expect(decision.reason).toContain('unnecessary');
    });

    test('LLMエラー時はルールベースにフォールバックすること', async () => {
      mockLLM.classifyCommentOpportunity.mockRejectedValue(
        new Error('LLM service unavailable')
      );

      const context: ContextSummary = {
        recentTranscripts: ['質問はありますか？'],
        topics: ['質問'],
        keywords: ['質問'],
        engagementLevel: 0.7,
      };

      const decision = await detector.evaluate(context);

      // ルールベースで質問を検出
      expect(decision.shouldComment).toBe(true);
      expect(decision.triggerType).toBe('question');
    });
  });

  describe('interval management', () => {
    test('最小インターバル内はコメントしないこと', async () => {
      detector.setLastCommentTime(Date.now() - 10000); // 10秒前

      const context: ContextSummary = {
        recentTranscripts: ['質問はありますか？'],
        topics: ['質問'],
        keywords: ['質問'],
        engagementLevel: 0.8,
      };

      const decision = await detector.evaluate(context);

      expect(decision.shouldComment).toBe(false);
      expect(decision.reason).toContain('too soon');
    });

    test('最大インターバルを超えたら強制的にトリガーすること', async () => {
      detector.setLastCommentTime(Date.now() - 200000); // 200秒前

      const context: ContextSummary = {
        recentTranscripts: ['普通の会話'],
        topics: ['会話'],
        keywords: ['会話'],
        engagementLevel: 0.4,
      };

      const decision = await detector.evaluate(context);

      expect(decision.shouldComment).toBe(true);
      expect(decision.reason).toContain('max interval');
    });
  });

  describe('trigger history', () => {
    test('トリガー履歴を記録できること', async () => {
      const context: ContextSummary = {
        recentTranscripts: ['質問はありますか？'],
        topics: ['質問'],
        keywords: ['質問'],
        engagementLevel: 0.7,
      };

      await detector.evaluate(context);
      const history = detector.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]?.triggerType).toBe('question');
    });

    test('同じトリガーが連続しないようにすること', async () => {
      const context1: ContextSummary = {
        recentTranscripts: ['質問はありますか？'],
        topics: ['質問'],
        keywords: ['質問'],
        engagementLevel: 0.7,
      };

      await detector.evaluate(context1);
      detector.setLastCommentTime(Date.now() - 40000); // 40秒前

      const context2: ContextSummary = {
        recentTranscripts: ['もう一度、質問はありますか？'],
        topics: ['質問'],
        keywords: ['質問'],
        engagementLevel: 0.7,
      };

      const decision = await detector.evaluate(context2);

      expect(decision.shouldComment).toBe(false);
      expect(decision.reason).toContain('same trigger');
    });
  });

  describe('configuration', () => {
    test('ルールを無効化できること', async () => {
      detector.updateConfig({
        ...config,
        rules: {
          ...config.rules,
          questionTrigger: false,
        },
      });

      const context: ContextSummary = {
        recentTranscripts: ['質問はありますか？'],
        topics: ['質問'],
        keywords: ['質問'],
        engagementLevel: 0.7,
      };

      const decision = await detector.evaluate(context);

      expect(decision.shouldComment).toBe(false);
    });

    test('信頼度の閾値を変更できること', async () => {
      detector.updateConfig({
        ...config,
        confidence: {
          ruleBasedThreshold: 0.9,
          llmThreshold: 0.95,
        },
      });

      const context: ContextSummary = {
        recentTranscripts: ['質問はありますか？'],
        topics: ['質問'],
        keywords: ['質問'],
        engagementLevel: 0.7,
      };

      const decision = await detector.evaluate(context);

      // 高い閾値により検出されない可能性
      expect(decision.confidence).toBeLessThan(0.9);
    });
  });
});
