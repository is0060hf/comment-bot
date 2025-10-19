/**
 * トリガー、生成、安全性の統合テスト
 * エンドツーエンドのフローをテスト
 */

import { TriggerDetector } from '../../src/trigger/detector';
import { CommentGenerator } from '../../src/llm/comment-generator';
import { SafetyChecker } from '../../src/safety/safety-checker';
import { ContextStore } from '../../src/context/store';
import { ModerationManager } from '../../src/core/moderation-manager';
import { CommentConfig, SafetyConfig } from '../../src/config/types';
import { ModerationCategory } from '../../src/ports/moderation';

describe('Trigger, Generation, Safety Integration', () => {
  let contextStore: ContextStore;
  let triggerDetector: TriggerDetector;
  let commentGenerator: CommentGenerator;
  let safetyChecker: SafetyChecker;
  let mockLLMAdapter: any;
  let mockModerationAdapter: any;

  beforeEach(() => {
    // コンテキストストア
    contextStore = new ContextStore();

    // モックアダプタ
    mockLLMAdapter = {
      classifyCommentOpportunity: jest.fn().mockResolvedValue({
        classification: 'necessary',
        confidence: 0.8
      }),
      generateComment: jest.fn().mockResolvedValue({
        comment: 'なるほど、勉強になります！✨',
        confidence: 0.9
      }),
      isHealthy: jest.fn().mockResolvedValue(true)
    };

    mockModerationAdapter = {
      moderate: jest.fn().mockResolvedValue({
        flagged: false,
        scores: {},
        flaggedCategories: [],
        provider: 'mock'
      }),
      rewriteContent: jest.fn().mockResolvedValue({
        original: 'test',
        rewritten: 'test',
        wasRewritten: false
      }),
      isHealthy: jest.fn().mockResolvedValue(true)
    };

    // トリガー検出器
    triggerDetector = new TriggerDetector({
      contextStore,
      llmAdapter: mockLLMAdapter,
      triggerConfig: {
        keywords: ['質問', 'どう思う', '意見'],
        minSilenceDuration: 3000,
        topicChangeThreshold: 0.7,
        enableLLMClassification: true
      }
    });

    // コメント生成器
    const commentConfig: CommentConfig = {
      targetLength: { min: 20, max: 60 },
      tone: 'friendly',
      characterPersona: '親しみやすい初心者',
      encouragedExpressions: ['なるほど', 'すごい'],
      ngWords: ['NG', '禁止'],
      emojiPolicy: {
        enabled: true,
        maxCount: 1,
        allowedEmojis: ['👏', '✨', '🙏', '💡']
      }
    };
    
    commentGenerator = new CommentGenerator({
      llmAdapter: mockLLMAdapter,
      commentConfig
    });

    // 安全性チェッカー
    const safetyConfig: SafetyConfig = {
      enabled: true,
      level: 'standard',
      blockOnUncertainty: true,
      moderationThresholds: {
        hate: 0.7,
        harassment: 0.7,
        selfHarm: 0.8,
        sexual: 0.7,
        violence: 0.7,
        illegal: 0.8,
        graphic: 0.8
      }
    };
    
    const moderationManager = new ModerationManager({
      primary: mockModerationAdapter,
      fallback: mockModerationAdapter,
      config: safetyConfig
    });
    
    safetyChecker = new SafetyChecker({
      moderationManager,
      safetyConfig
    });
  });

  describe('完全なフロー', () => {
    it('トリガー検出→コメント生成→安全性チェック→投稿可能', async () => {
      // コンテキストを準備
      contextStore.addTranscript({
        text: 'プログラミングについて質問があります',
        timestamp: Date.now()
      });
      contextStore.addTopic('プログラミング');

      // 1. トリガー検出
      const triggerResult = await triggerDetector.evaluateOpportunity(
        'この件についてどう思うか教えてください'
      );
      
      expect(triggerResult.shouldComment).toBe(true);
      expect(triggerResult.reason).toBe('llm_classification');
      expect(triggerResult.llmClassification).toBe('necessary');

      // 2. コメント生成
      const generationContext = {
        recentTopics: contextStore.getTopics(),
        keywords: ['質問', 'プログラミング'],
        streamTitle: 'プログラミング配信',
        policy: {
          tone: 'friendly',
          characterPersona: '親しみやすい初心者',
          encouragedExpressions: ['なるほど', 'すごい'],
          targetLength: { min: 20, max: 60 }
        }
      };
      
      const generatedResult = await commentGenerator.generate(generationContext);
      
      expect(generatedResult.comment).toBeTruthy();
      expect(generatedResult.comment.length).toBeGreaterThanOrEqual(20);
      expect(generatedResult.comment.length).toBeLessThanOrEqual(60);

      // 3. 安全性チェック
      const safetyResult = await safetyChecker.check(generatedResult.comment);
      
      expect(safetyResult.isSafe).toBe(true);
      expect(safetyResult.action).toBe('approve');
    });

    it('NGワードを含むコメントが適切に処理される', async () => {
      // モックを調整
      mockLLMAdapter.generateComment.mockResolvedValueOnce({
        comment: 'これは禁止ワードを含むコメントです',
        confidence: 0.8
      });

      const generationContext = {
        recentTopics: ['test'],
        keywords: ['test'],
        streamTitle: 'テスト配信',
        policy: {
          tone: 'friendly',
          characterPersona: 'テスト',
          encouragedExpressions: [],
          targetLength: { min: 20, max: 60 }
        }
      };
      
      const generatedResult = await commentGenerator.generate(generationContext);
      
      expect(generatedResult.comment).not.toContain('禁止');
      expect(generatedResult.wasAdjusted).toBe(true);
    });

    it('危険なコメントがブロックされる', async () => {
      // モデレーションが危険と判定
      mockModerationAdapter.moderate.mockResolvedValueOnce({
        flagged: true,
        scores: { hate: 0.9, harassment: 0.8 },
        flaggedCategories: [ModerationCategory.HATE, ModerationCategory.HARASSMENT],
        provider: 'mock'
      });

      const dangerousComment = '攻撃的なコメント';
      const safetyResult = await safetyChecker.check(dangerousComment);
      
      expect(safetyResult.isSafe).toBe(false);
      expect(safetyResult.action).toBe('block');
      expect(safetyResult.flaggedCategories).toContain(ModerationCategory.HATE);
    });
  });

  describe('エッジケース', () => {
    it('LLMが利用できない場合でもルールベースで動作する', async () => {
      // LLMを無効化
      triggerDetector.updateConfig({
        keywords: ['質問', 'どう思う', '意見'],
        minSilenceDuration: 3000,
        topicChangeThreshold: 0.7,
        enableLLMClassification: false
      });

      const triggerResult = await triggerDetector.evaluateOpportunity(
        '質問があります。どう思いますか？'  // Multiple keywords to reach confidence >= 0.5
      );
      
      expect(triggerResult.shouldComment).toBe(true);
      expect(triggerResult.llmClassification).toBeUndefined();
      expect(triggerResult.reason).toContain('keyword');
    });

    it('静寂時にコメント機会を検出する', async () => {
      // 過去のトランスクリプト
      contextStore.addTranscript({
        text: '説明は以上です',
        timestamp: Date.now() - 4000
      });

      const silenceResult = await triggerDetector.evaluateSilence();
      
      expect(silenceResult.shouldComment).toBe(true);
      expect(silenceResult.reason).toContain('silence');
    });

    it('個人情報を含むコメントがブロックされる', async () => {
      const commentWithPII = '私の電話番号は090-1234-5678です';
      const safetyResult = await safetyChecker.check(commentWithPII);
      
      expect(safetyResult.isSafe).toBe(false);
      expect(safetyResult.action).toBe('block');
      expect(safetyResult.reason).toContain('personal_info');
    });
  });

  describe('設定の動的更新', () => {
    it('すべてのコンポーネントの設定を更新できる', () => {
      // トリガー設定の更新
      triggerDetector.updateConfig({
        keywords: ['新キーワード'],
        minSilenceDuration: 5000,
        topicChangeThreshold: 0.5,
        enableLLMClassification: false
      });

      // コメント設定の更新
      const newCommentConfig: CommentConfig = {
        targetLength: { min: 10, max: 30 },
        tone: 'casual',
        characterPersona: 'カジュアルなコメンター',
        encouragedExpressions: ['へー', 'おお'],
        ngWords: ['新NG'],
        emojiPolicy: {
          enabled: false,
          maxCount: 0,
          allowedEmojis: []
        }
      };
      
      commentGenerator.updateConfig(newCommentConfig);

      // 安全設定の更新
      const newSafetyConfig: SafetyConfig = {
        enabled: true,
        level: 'strict',
        blockOnUncertainty: true,
        moderationThresholds: {
          hate: 0.5,
          harassment: 0.5,
          selfHarm: 0.6,
          sexual: 0.5,
          violence: 0.5,
          illegal: 0.6,
          graphic: 0.6
        }
      };
      
      safetyChecker.updateConfig(newSafetyConfig);

      // 更新が反映されていることを確認
      const ruleResult = triggerDetector.evaluateRules('新キーワード について意見をください？');
      expect(ruleResult.shouldComment).toBe(true);
      expect(ruleResult.reason).toContain('keyword');
    });
  });

  describe('パフォーマンスと統計', () => {
    it('複数のコメントを処理して統計を取得できる', async () => {
      // 複数のコメントをチェック
      const comments = [
        '安全なコメント1',
        '安全なコメント2',
        '危険なコメント'
      ];

      // 3番目のコメントは危険と判定
      mockModerationAdapter.moderate
        .mockResolvedValueOnce({ flagged: false, scores: {}, flaggedCategories: [], provider: 'mock' })
        .mockResolvedValueOnce({ flagged: false, scores: {}, flaggedCategories: [], provider: 'mock' })
        .mockResolvedValueOnce({
          flagged: true,
          scores: { hate: 0.8 },
          flaggedCategories: [ModerationCategory.HATE],
          provider: 'mock'
        });

      for (const comment of comments) {
        await safetyChecker.check(comment);
      }

      const stats = safetyChecker.getStatistics();
      
      expect(stats.totalChecks).toBe(3);
      expect(stats.approvedCount).toBe(2);
      expect(stats.blockedCount).toBe(1);
      expect(stats.flaggedCategories[ModerationCategory.HATE]).toBe(1);
    });
  });
});
