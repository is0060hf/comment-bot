/**
 * E2Eパイプラインテスト
 * 音声認識からコメント投稿までの全体的な流れをモックで検証
 */

import { CommentPipeline } from '../../src/core/comment-pipeline';
import { MockSTTAdapter } from '../../src/adapters/mocks/stt';
import { MockLLMAdapter } from '../../src/adapters/mocks/llm';
import { MockModerationAdapter } from '../../src/adapters/mocks/moderation';
import { MockYouTubeAdapter } from '../../src/adapters/mocks/youtube';
import { ConfigManager } from '../../src/config/config-manager';
import { CommentLengthPolicy } from '../../src/policies/comment-length';
import { NGWordsPolicy } from '../../src/policies/ng-words';
import { EmojiPolicy } from '../../src/policies/emoji';
import { CommentGenerationPrompt } from '../../src/prompts/comment-generation';
import { CommentClassificationPrompt } from '../../src/prompts/comment-classification';
import { ModerationManager, ModerationManagerConfig } from '../../src/core/moderation-manager';
import { DEFAULT_CONFIG } from '../../src/config/types';
import type { AppConfig } from '../../src/config/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Comment Pipeline E2E', () => {
  let pipeline: CommentPipeline;
  let config: AppConfig;
  let tempDir: string;
  let configPath: string;
  
  // モックアダプタ
  let sttAdapter: MockSTTAdapter;
  let llmAdapter: MockLLMAdapter;
  let moderationAdapter: MockModerationAdapter;
  let youtubeAdapter: MockYouTubeAdapter;
  
  // ポリシーとプロンプト
  let lengthPolicy: CommentLengthPolicy;
  let ngWordsPolicy: NGWordsPolicy;
  let emojiPolicy: EmojiPolicy;
  let generationPrompt: CommentGenerationPrompt;
  let classificationPrompt: CommentClassificationPrompt;
  let moderationManager: ModerationManager;

  beforeEach(async () => {
    // 一時設定ファイルの準備
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comment-bot-test-'));
    configPath = path.join(tempDir, 'config.yaml');
    
    // デフォルト設定を使用
    config = { ...DEFAULT_CONFIG };
    
    // モックアダプタの初期化
    sttAdapter = new MockSTTAdapter({
      healthy: true,
      failureRate: 0
    });
    
    llmAdapter = new MockLLMAdapter({
      healthy: true,
      failureRate: 0
    });
    
    moderationAdapter = new MockModerationAdapter({
      shouldFail: false,
      isHealthy: true,
      flagProbability: 0.1,
      rewriteProbability: 0.3
    });
    
    youtubeAdapter = new MockYouTubeAdapter({
      healthy: true,
      isLive: true,
      rateLimitExceeded: false
    });
    
    // ポリシーとマネージャーの初期化
    lengthPolicy = new CommentLengthPolicy(config.comment);
    ngWordsPolicy = new NGWordsPolicy(config.comment);
    emojiPolicy = new EmojiPolicy(config.comment);
    generationPrompt = new CommentGenerationPrompt(config.comment);
    classificationPrompt = new CommentClassificationPrompt(config.comment);
    
    const moderationConfig: ModerationManagerConfig = {
      primary: moderationAdapter,
      fallback: moderationAdapter,
      config: config.safety
    };
    moderationManager = new ModerationManager(moderationConfig);
    
    // パイプラインの初期化
    pipeline = new CommentPipeline({
      config,
      sttAdapter,
      llmAdapter,
      moderationManager,
      youtubeAdapter,
      lengthPolicy,
      ngWordsPolicy,
      emojiPolicy,
      generationPrompt,
      classificationPrompt
    });
  });

  afterEach(async () => {
    // パイプラインの停止
    await pipeline.stop();
    
    // 一時ファイルのクリーンアップ
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('基本的なパイプライン動作', () => {
    test('音声認識からコメント投稿までの完全な流れ', async () => {
      const liveChatId = 'test-live-chat-id';
      const audioBuffer = Buffer.from('mock audio data');
      
      // LLMAdapterのclassifyCommentOpportunityをモックして常にnecessaryを返すように
      jest.spyOn(llmAdapter, 'classifyCommentOpportunity').mockResolvedValue({
        classification: 'necessary' as const,
        confidence: 0.9,
        reason: 'テスト用'
      });
      
      // パイプラインの開始
      await pipeline.start(liveChatId);
      
      // 音声データの処理
      const result = await pipeline.processAudio(audioBuffer);
      
      expect(result).toMatchObject({
        success: true,
        transcript: expect.any(String),
        generatedComment: expect.any(String),
        posted: true,
        postId: expect.any(String)
      });
      
      // 投稿されたコメントがポリシーに準拠していることを確認
      if (result.generatedComment) {
        expect(lengthPolicy.validate(result.generatedComment)).toBe(true);
        expect(ngWordsPolicy.validate(result.generatedComment).isValid).toBe(true);
        expect(emojiPolicy.validate(result.generatedComment).isValid).toBe(true);
      }
    });

    test('コンテキスト管理が正しく機能すること', async () => {
      const liveChatId = 'test-live-chat-id';
      await pipeline.start(liveChatId);
      
      // 複数の音声入力を処理
      const audioInputs = [
        Buffer.from('first audio'),
        Buffer.from('second audio'),
        Buffer.from('third audio')
      ];
      
      const results = [];
      for (const audio of audioInputs) {
        const result = await pipeline.processAudio(audio);
        results.push(result);
      }
      
      // すべての処理が成功
      expect(results.every(r => r.success)).toBe(true);
      
      // コンテキストが蓄積されていることを確認
      const context = pipeline.getContext();
      // recentTopicsは特定のキーワードがある場合のみ追加される
      expect(context.recentTranscripts.length).toBe(3);
    });

    test('コメント機会の判定が動作すること', async () => {
      const liveChatId = 'test-live-chat-id';
      await pipeline.start(liveChatId);
      
      // STTのtranscribeをモックして特定の文字列を返す
      const mockTranscribe = jest.spyOn(sttAdapter, 'transcribe');
      
      // 質問が含まれる場合
      mockTranscribe.mockResolvedValueOnce({
        transcript: 'みなさんはどう思いますか？質問があれば教えてください',
        confidence: 0.95,
        language: 'ja',
        timestamp: Date.now()
      });
      
      const shouldComment1 = await pipeline.evaluateCommentOpportunity(Buffer.from('audio1'));
      expect(shouldComment1).toBeTruthy();
      
      // 通常の発話
      mockTranscribe.mockResolvedValueOnce({
        transcript: '次のスライドに移ります',
        confidence: 0.95,
        language: 'ja',
        timestamp: Date.now()
      });
      
      const shouldComment2 = await pipeline.evaluateCommentOpportunity(Buffer.from('audio2'));
      expect(shouldComment2).toBeFalsy();
    });
  });

  describe('エラーハンドリング', () => {
    test('STT失敗時のグレースフルな処理', async () => {
      // STTを失敗モードに設定
      sttAdapter = new MockSTTAdapter({
        failureRate: 1.0,
        healthy: false
      });
      
      pipeline = new CommentPipeline({
        config,
        sttAdapter,
        llmAdapter,
        moderationManager,
        youtubeAdapter,
        lengthPolicy,
        ngWordsPolicy,
        emojiPolicy,
        generationPrompt,
        classificationPrompt
      });
      
      const liveChatId = 'test-live-chat-id';
      await pipeline.start(liveChatId);
      
      const result = await pipeline.processAudio(Buffer.from('audio'));
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('STT failed');
      expect(result.posted).toBe(false);
    });

    test('LLM失敗時のフォールバック動作', async () => {
      // LLMを50%失敗率に設定
      llmAdapter = new MockLLMAdapter({
        healthy: true,
        failureRate: 0.5
      });
      
      pipeline = new CommentPipeline({
        config,
        sttAdapter,
        llmAdapter,
        moderationManager,
        youtubeAdapter,
        lengthPolicy,
        ngWordsPolicy,
        emojiPolicy,
        generationPrompt,
        classificationPrompt
      });
      
      const liveChatId = 'test-live-chat-id';
      await pipeline.start(liveChatId);
      
      // 複数回試行して、一部は成功することを確認
      const results = [];
      for (let i = 0; i < 10; i++) {
        const result = await pipeline.processAudio(Buffer.from(`audio ${i}`));
        results.push(result);
      }
      
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(0);
      expect(successCount).toBeLessThan(10);
    });

    test('YouTube API レート制限の処理', async () => {
      // レート制限をシミュレートするため新しいモックを作成
      let postCount = 0;
      const limitedYoutubeAdapter = new MockYouTubeAdapter({
        healthy: true,
        isLive: true,
        rateLimitExceeded: false
      });
      
      // getRateLimitInfoをモックして残り回数を制御
      jest.spyOn(limitedYoutubeAdapter, 'getRateLimitInfo').mockImplementation(async () => {
        const remaining = Math.max(0, 2 - postCount);
        return {
          remaining,
          limit: 100,
          resetAt: new Date(Date.now() + 30000),
          total: 100,
          windowEndTime: new Date(Date.now() + 30000)
        };
      });
      
      // postMessageをモックしてカウントを増やす
      const originalPost = limitedYoutubeAdapter.postMessage.bind(limitedYoutubeAdapter);
      jest.spyOn(limitedYoutubeAdapter, 'postMessage').mockImplementation(async (liveChatId, message) => {
        if (postCount >= 2) {
          throw new Error('YouTube API rate limit exceeded');
        }
        postCount++;
        return originalPost(liveChatId, message);
      });
      
      // 新しいパイプラインインスタンスを作成
      const limitedPipeline = new CommentPipeline({
        config,
        sttAdapter,
        llmAdapter,
        moderationManager,
        youtubeAdapter: limitedYoutubeAdapter,
        lengthPolicy,
        ngWordsPolicy,
        emojiPolicy,
        generationPrompt,
        classificationPrompt
      });
      
      const liveChatId = 'test-live-chat-id';
      await limitedPipeline.start(liveChatId);
      
      // 常にコメントが必要と判定されるようにモック
      jest.spyOn(llmAdapter, 'classifyCommentOpportunity').mockResolvedValue({
        classification: 'necessary' as const,
        confidence: 0.9
      });
      
      // 3回目の投稿でレート制限に達する
      const results = [];
      
      // 1回目
      results.push(await limitedPipeline.processAudio(Buffer.from('audio 0')));
      
      // 最小間隔を待つ
      await new Promise(resolve => setTimeout(resolve, config.rateLimit.minIntervalSeconds * 1000 + 100));
      
      // 2回目
      results.push(await limitedPipeline.processAudio(Buffer.from('audio 1')));
      
      // 最小間隔を待つ
      await new Promise(resolve => setTimeout(resolve, config.rateLimit.minIntervalSeconds * 1000 + 100));
      
      // 3回目（レート制限で失敗するはず）
      results.push(await limitedPipeline.processAudio(Buffer.from('audio 2')));
      
      // 停止
      await limitedPipeline.stop();
      
      // 最初の2回は成功、3回目はレート制限
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.posted).toBe(true);
      expect(results[1]?.success).toBe(true);
      expect(results[1]?.posted).toBe(true);
      expect(results[2]?.success).toBe(false);
      expect(results[2]?.error).toContain('rate limit');
    });
  });

  describe('ポリシー統合', () => {
    test('すべてのポリシーが適用されること', async () => {
      const liveChatId = 'test-live-chat-id';
      await pipeline.start(liveChatId);
      
      // 各種違反を含む入力をシミュレート
      const testCases = [
        {
          name: '長すぎるコメント',
          mockTranscript: 'これは非常に長いコメントで、文字数制限を超えてしまう可能性があるため、適切に短縮される必要があります',
          expectAdjustment: true
        },
        {
          name: 'NG語を含むコメント',
          mockTranscript: 'バカみたいな配信ですね',
          expectSanitization: true
        },
        {
          name: '絵文字が多すぎるコメント',
          mockTranscript: 'すごい！😀😃😄😁😆😅😂🤣',
          expectEmojiAdjustment: true
        }
      ];
      
      for (const testCase of testCases) {
        // STTモックに特定の文字列を返させる
        sttAdapter = new MockSTTAdapter({
          healthy: true,
          failureRate: 0
        });
        
        // transcribeメソッドをモックして特定の文孺列を返す
        jest.spyOn(sttAdapter, 'transcribe').mockResolvedValue({
          transcript: testCase.mockTranscript,
          confidence: 0.95,
          language: 'ja',
          timestamp: Date.now()
        });
        
        const tempPipeline = new CommentPipeline({
          config,
          sttAdapter,
          llmAdapter,
          moderationManager,
          youtubeAdapter,
          lengthPolicy,
          ngWordsPolicy,
          emojiPolicy,
          generationPrompt,
          classificationPrompt
        });
        
        await tempPipeline.start(liveChatId);
        const result = await tempPipeline.processAudio(Buffer.from('audio'));
        await tempPipeline.stop();
        
        if (result.success && result.generatedComment) {
          // ポリシーが適用されていることを確認
          expect(lengthPolicy.validate(result.generatedComment)).toBe(true);
          expect(ngWordsPolicy.validate(result.generatedComment).isValid).toBe(true);
          expect(emojiPolicy.validate(result.generatedComment).isValid).toBe(true);
        }
      }
    });
  });

  describe('パフォーマンスとタイミング', () => {
    test('レスポンス時間が許容範囲内であること', async () => {
      const liveChatId = 'test-live-chat-id';
      await pipeline.start(liveChatId);
      
      const startTime = Date.now();
      const result = await pipeline.processAudio(Buffer.from('audio'));
      const endTime = Date.now();
      
      const processingTime = endTime - startTime;
      
      // E2Eレイテンシが3秒以内
      expect(processingTime).toBeLessThan(3000);
      expect(result.success).toBe(true);
    });

    test('連続投稿の間隔制御', async () => {
      const liveChatId = 'test-live-chat-id';
      
      // 常にコメントが必要と判定されるようにモック
      jest.spyOn(llmAdapter, 'classifyCommentOpportunity').mockResolvedValue({
        classification: 'necessary' as const,
        confidence: 0.9
      });
      
      await pipeline.start(liveChatId);
      
      const results = [];
      const timestamps: number[] = [];
      
      // 短時間に複数の音声を処理
      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        const result = await pipeline.processAudio(Buffer.from(`audio ${i}`));
        results.push(result);
        if (result.posted) {
          timestamps.push(Date.now());
        }
      }
      
      // 最初は投稿され、2回目以降は間隔制御により投稿されないはず
      expect(results[0]?.posted).toBe(true);
      expect(results[1]?.posted).toBe(false); // 間隔が短すぎる
      expect(results[2]?.posted).toBe(false); // 間隔が短すぎる
      
      // 投稿された数を確認
      expect(timestamps.length).toBe(1);
    });
  });

  describe('状態管理', () => {
    test('パイプラインの開始と停止', async () => {
      const liveChatId = 'test-live-chat-id';
      
      // 開始前の状態
      expect(pipeline.isRunning()).toBe(false);
      
      // 開始
      await pipeline.start(liveChatId);
      expect(pipeline.isRunning()).toBe(true);
      
      // 処理が可能
      const result = await pipeline.processAudio(Buffer.from('audio'));
      expect(result.success).toBe(true);
      
      // 停止
      await pipeline.stop();
      expect(pipeline.isRunning()).toBe(false);
      
      // 停止後は処理不可
      const resultAfterStop = await pipeline.processAudio(Buffer.from('audio'));
      expect(resultAfterStop.success).toBe(false);
      expect(resultAfterStop.error).toContain('Pipeline not running');
    });

    test('設定の動的更新', async () => {
      const liveChatId = 'test-live-chat-id';
      await pipeline.start(liveChatId);
      
      // 初期設定での動作確認
      const result1 = await pipeline.processAudio(Buffer.from('audio'));
      expect(result1.success).toBe(true);
      
      // 設定を更新（より厳しいモデレーション）
      const updatedConfig = {
        ...config,
        safety: {
          ...config.safety,
          level: 'strict' as const
        }
      };
      
      await pipeline.updateConfig(updatedConfig);
      
      // 更新後の動作確認
      const result2 = await pipeline.processAudio(Buffer.from('audio'));
      expect(result2.success).toBe(true);
    });
  });
});
