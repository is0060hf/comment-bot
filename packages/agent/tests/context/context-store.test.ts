/**
 * Tsumiki AITDD - Red Phase
 * タスク4: コンテキストストアのテストケース
 */

import { ContextStore, ContextConfig } from '../../src/context/context-store';
import { TranscriptSegment } from '@comment-bot/shared';

describe('ContextStore', () => {
  let store: ContextStore;
  let config: ContextConfig;

  beforeEach(() => {
    config = {
      maxTranscripts: 10,
      maxTopics: 5,
      maxKeywords: 20,
      topicWindowMs: 300000, // 5分
      keywordDecayMs: 60000, // 1分
    };
    store = new ContextStore(config);
  });

  describe('transcript management', () => {
    test('トランスクリプトを追加できること', () => {
      const segment: TranscriptSegment = {
        text: 'こんにちは、今日はプログラミングの話をします',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      };

      store.addTranscript(segment);
      const context = store.getContext();

      expect(context.recentTranscripts).toHaveLength(1);
      expect(context.recentTranscripts[0]).toBe(segment.text);
    });

    test('最大数を超えた場合、古いトランスクリプトが削除されること', () => {
      // 最大数以上のトランスクリプトを追加
      for (let i = 0; i < 15; i++) {
        store.addTranscript({
          text: `トランスクリプト${i}`,
          timestamp: Date.now() + i * 1000,
          confidence: 0.9,
          isFinal: true,
          language: 'ja',
        });
      }

      const context = store.getContext();
      expect(context.recentTranscripts).toHaveLength(config.maxTranscripts);
      expect(context.recentTranscripts[0]).toBe('トランスクリプト5');
      expect(context.recentTranscripts[9]).toBe('トランスクリプト14');
    });

    test('暫定結果は無視されること', () => {
      store.addTranscript({
        text: '暫定結果',
        timestamp: Date.now(),
        confidence: 0.8,
        isFinal: false,
        language: 'ja',
      });

      const context = store.getContext();
      expect(context.recentTranscripts).toHaveLength(0);
    });
  });

  describe('topic extraction', () => {
    test('トランスクリプトからトピックを抽出できること', () => {
      store.addTranscript({
        text: '今日はTypeScriptとReactについて話します。特にNext.jsの新機能が面白いです。',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const context = store.getContext();
      expect(context.topics.length).toBeGreaterThan(0);
      expect(context.topics.some((t: string) => t === 'TypeScript')).toBe(true);
      expect(context.topics.some((t: string) => t === 'React')).toBe(true);
      expect(context.topics.some((t: string) => t === 'Next.js')).toBe(true);
    });

    test('重複するトピックは統合されること', () => {
      store.addTranscript({
        text: 'TypeScriptの話をします',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      store.addTranscript({
        text: 'またTypeScriptについて説明します',
        timestamp: Date.now() + 1000,
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const context = store.getContext();
      const typeScriptTopics = context.topics.filter((t: string) => t === 'TypeScript');
      expect(typeScriptTopics).toHaveLength(1);
    });

    test('古いトピックは除外されること', () => {
      // 古いトランスクリプト
      store.addTranscript({
        text: '古いトピック：Python',
        timestamp: Date.now() - config.topicWindowMs - 1000,
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      // 新しいトランスクリプト
      store.addTranscript({
        text: '新しいトピック：JavaScript',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const context = store.getContext();
      expect(context.topics.some((t: string) => t === 'Python')).toBe(false);
      expect(context.topics.some((t: string) => t === 'JavaScript')).toBe(true);
    });
  });

  describe('keyword extraction', () => {
    test('キーワードを抽出できること', () => {
      store.addTranscript({
        text: 'プログラミング言語のTypeScriptは、JavaScriptのスーパーセットです。型安全性が特徴です。',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const context = store.getContext();
      expect(context.keywords.length).toBeGreaterThan(0);
      expect(context.keywords).toContain('TypeScript');
      expect(context.keywords).toContain('JavaScript');
      expect(context.keywords).toContain('型安全性');
    });

    test('キーワードの重要度が計算されること', () => {
      // 複数回言及されるキーワード
      store.addTranscript({
        text: 'TypeScriptは素晴らしい',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      store.addTranscript({
        text: 'TypeScriptの型システムについて',
        timestamp: Date.now() + 1000,
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const keywordScores = store.getKeywordScores();
      expect(keywordScores.get('TypeScript')).toBeGreaterThan(1);
    });

    test('最大数を超えた場合、重要度の低いキーワードが削除されること', () => {
      // 多数のキーワードを含むトランスクリプトを追加
      for (let i = 0; i < 30; i++) {
        store.addTranscript({
          text: `キーワード${i} について説明します`,
          timestamp: Date.now() + i * 1000,
          confidence: 0.95,
          isFinal: true,
          language: 'ja',
        });
      }

      const context = store.getContext();
      expect(context.keywords.length).toBeLessThanOrEqual(config.maxKeywords);
    });
  });

  describe('engagement level', () => {
    test('エンゲージメントレベルが計算されること', () => {
      const context = store.getContext();
      expect(context.engagementLevel).toBeGreaterThanOrEqual(0);
      expect(context.engagementLevel).toBeLessThanOrEqual(1);
    });

    test('質問でエンゲージメントレベルが上昇すること', () => {
      const initialLevel = store.getContext().engagementLevel;

      store.addTranscript({
        text: '質問はありますか？コメントで教えてください。',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const newLevel = store.getContext().engagementLevel;
      expect(newLevel).toBeGreaterThan(initialLevel);
    });

    test('話題転換でエンゲージメントレベルが変化すること', () => {
      store.addTranscript({
        text: '今までPythonの話をしていましたが、',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const level1 = store.getContext().engagementLevel;

      store.addTranscript({
        text: '次はJavaScriptについて話しましょう。',
        timestamp: Date.now() + 1000,
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const level2 = store.getContext().engagementLevel;
      expect(level2).not.toBe(level1);
    });
  });

  describe('viewer questions', () => {
    test('視聴者の質問を検出できること', () => {
      store.addTranscript({
        text: 'チャットで「初心者でも大丈夫ですか？」という質問をいただきました。',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const context = store.getContext();
      expect(context.viewerQuestions).toBeDefined();
      expect(context.viewerQuestions?.length).toBeGreaterThan(0);
      expect(context.viewerQuestions?.[0]).toContain('初心者でも大丈夫ですか');
    });

    test('複数の質問を保持できること', () => {
      store.addTranscript({
        text: '「どのくらい時間がかかりますか？」という質問と',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      store.addTranscript({
        text: '「必要な前提知識は？」という質問をいただきました。',
        timestamp: Date.now() + 1000,
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const context = store.getContext();
      expect(context.viewerQuestions?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('context reset', () => {
    test('コンテキストをリセットできること', () => {
      store.addTranscript({
        text: 'いくつかのコンテンツ',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      expect(store.getContext().recentTranscripts).toHaveLength(1);

      store.reset();

      const context = store.getContext();
      expect(context.recentTranscripts).toHaveLength(0);
      expect(context.topics).toHaveLength(0);
      expect(context.keywords).toHaveLength(0);
      expect(context.engagementLevel).toBe(0.5);
    });
  });

  describe('context summary', () => {
    test('コンテキストサマリーを取得できること', () => {
      store.addTranscript({
        text: 'TypeScriptとReactについて話しています。質問はありますか？',
        timestamp: Date.now(),
        confidence: 0.95,
        isFinal: true,
        language: 'ja',
      });

      const summary = store.getSummary();
      expect(summary).toContain('トピック');
      expect(summary).toContain('キーワード');
      expect(summary).toContain('エンゲージメント');
    });
  });
});
