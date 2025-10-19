/**
 * トリガー検出のテスト
 * コメント投稿機会を判定する機能のテスト
 */

import { TriggerDetector } from '../../src/trigger/detector';
import { ContextStore } from '../../src/context/store';
import { CommentOpportunityContext } from '../../src/ports/llm';

describe('TriggerDetector', () => {
  let detector: TriggerDetector;
  let contextStore: ContextStore;
  let mockLLMAdapter: any;

  beforeEach(() => {
    contextStore = new ContextStore();
    mockLLMAdapter = {
      classifyCommentOpportunity: jest.fn().mockResolvedValue({
        classification: 'unnecessary',
        confidence: 0.8
      }),
      isHealthy: jest.fn().mockResolvedValue(true)
    };

    detector = new TriggerDetector({
      contextStore,
      llmAdapter: mockLLMAdapter,
      triggerConfig: {
        keywords: ['質問', 'どう思う', '意見', 'コメント'],
        minSilenceDuration: 3000,
        topicChangeThreshold: 0.7,
        enableLLMClassification: true
      }
    });
  });

  describe('キーワードベースのトリガー検出', () => {
    it('キーワードが含まれる場合、コメント機会として検出すること', async () => {
      const transcript = '今の内容についてどう思うか、コメントで教えてください';
      
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(true);
      expect(result.reason).toContain('keyword');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('キーワードが含まれない場合、コメント機会として検出しないこと', async () => {
      // LLMを無効化してルールベースのみでテスト
      detector.updateConfig({
        keywords: ['質問', 'どう思う', '意見', 'コメント'],
        minSilenceDuration: 3000,
        topicChangeThreshold: 0.7,
        enableLLMClassification: false
      });
      
      const transcript = '今日は天気が良いですね';
      
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('複数のキーワードが含まれる場合、信頼度が高くなること', async () => {
      const transcript = '質問があります。この件についてどう思うか意見を聞かせてください';
      
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('静寂検出によるトリガー', () => {
    it('一定時間の静寂後にコメント機会を検出すること', async () => {
      // 最後の発話から3秒以上経過
      contextStore.addTranscript({
        text: '説明は以上です',
        timestamp: Date.now() - 4000
      });

      const result = await detector.evaluateSilence();
      
      expect(result.shouldComment).toBe(true);
      expect(result.reason).toContain('silence');
    });

    it('静寂時間が短い場合、コメント機会として検出しないこと', async () => {
      // 最後の発話から1秒しか経過していない
      contextStore.addTranscript({
        text: '説明中です',
        timestamp: Date.now() - 1000
      });

      const result = await detector.evaluateSilence();
      
      expect(result.shouldComment).toBe(false);
    });
  });

  describe('話題変化の検出', () => {
    it('話題が変わった場合、コメント機会として検出すること', async () => {
      // LLMを無効化してルールベースのみでテスト
      detector.updateConfig({
        keywords: ['質問', 'どう思う', '意見', 'コメント'],
        minSilenceDuration: 3000,
        topicChangeThreshold: 0.3, // 閾値を下げる
        enableLLMClassification: false
      });
      
      // 前の話題を追加
      contextStore.addTranscript({
        text: 'プログラミングについて説明します。JavaScriptは人気の言語です。',
        timestamp: Date.now() - 5000
      });
      
      // 最初の評価で話題を記録
      await detector.evaluateOpportunity('プログラミングの話です');

      // 新しい話題
      const transcript = 'さて、次は料理の話をしましょう。今日は和食について';
      
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(true);
      expect(result.reason).toContain('topic_change');
    });

    it('同じ話題が継続している場合、コメント機会として検出しないこと', async () => {
      contextStore.addTranscript({
        text: 'JavaScriptのasync/awaitについて説明します',
        timestamp: Date.now() - 2000
      });
      contextStore.addTopic('JavaScript');

      const transcript = 'async/awaitを使うとPromiseが簡潔に書けます';
      
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(false);
    });
  });

  describe('LLMによる分類', () => {
    it('LLMがnecessaryと判定した場合、コメント機会として検出すること', async () => {
      mockLLMAdapter.classifyCommentOpportunity.mockResolvedValueOnce({
        classification: 'necessary',
        confidence: 0.9
      });
      
      const transcript = '今の説明についてご意見をお聞かせください';
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(true);
      expect(result.llmClassification).toBe('necessary');
      expect(mockLLMAdapter.classifyCommentOpportunity).toHaveBeenCalled();
    });

    it('LLMがunnecessaryと判定した場合でも、強いキーワードがあれば検出すること', async () => {
      mockLLMAdapter.classifyCommentOpportunity.mockResolvedValueOnce({
        classification: 'unnecessary',
        confidence: 0.3
      });
      
      const transcript = 'コメントで質問してください！どう思うか教えて！';
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(true);
      expect(result.reason).toContain('strong_keyword_override');
    });

    it('LLMが利用できない場合、ルールベースで判定すること', async () => {
      mockLLMAdapter.classifyCommentOpportunity.mockRejectedValueOnce(new Error('LLM error'));
      
      const transcript = '質問はありますか？';
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(true);
      expect(result.reason).toContain('keyword');
      expect(result.llmClassification).toBeUndefined();
    });
  });

  describe('頻度制限', () => {
    it('最近コメントした場合、新たなコメント機会を抑制すること', async () => {
      // 30秒前にコメント済み
      detector.recordCommentPosted(Date.now() - 30000);
      
      const transcript = '質問はありますか？';
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(false);
      expect(result.reason).toContain('recent_comment');
    });

    it('十分な時間が経過していれば、コメント機会を検出すること', async () => {
      // LLMを無効化してルールベースのみでテスト
      detector.updateConfig({
        keywords: ['質問', 'どう思う', '意見', 'コメント'],
        minSilenceDuration: 3000,
        topicChangeThreshold: 0.7,
        enableLLMClassification: false
      });
      
      // 3分前にコメント
      detector.recordCommentPosted(Date.now() - 180000);
      
      const transcript = '質問はありますか？';
      const result = await detector.evaluateOpportunity(transcript);
      
      expect(result.shouldComment).toBe(true);
    });
  });

  describe('コンテキスト生成', () => {
    it('LLM用のコンテキストを適切に生成すること', () => {
      contextStore.addTranscript({
        text: 'JavaScriptについて説明しています',
        timestamp: Date.now() - 5000
      });
      contextStore.addTranscript({
        text: 'Reactは人気のフレームワークです',
        timestamp: Date.now() - 2000
      });
      contextStore.addTopic('JavaScript');
      contextStore.addTopic('React');

      const context = detector.buildContext();
      
      expect(context.transcript).toBe('Reactは人気のフレームワークです');
      expect(context.recentTopics).toContain('JavaScript');
      expect(context.recentTopics).toContain('React');
      expect(context.engagementLevel).toBeGreaterThan(0);
    });
  });

  describe('設定の更新', () => {
    it('トリガー設定を動的に更新できること', () => {
      const newConfig = {
        keywords: ['新しい', 'キーワード'],
        minSilenceDuration: 5000,
        topicChangeThreshold: 0.8,
        enableLLMClassification: false
      };

      detector.updateConfig(newConfig);
      
      // 新しいキーワードで検出されることを確認
      const result = detector.evaluateRules('新しいキーワードです');
      expect(result.shouldComment).toBe(true);
    });
  });
});
