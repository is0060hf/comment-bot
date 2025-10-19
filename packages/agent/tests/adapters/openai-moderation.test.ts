/**
 * Tsumiki AITDD - Red Phase
 * タスク51: OpenAI Moderationアダプタのテストケース
 */

import { OpenAIModerationAdapter } from '../../src/adapters/openai-moderation';
import { 
  ModerationPort, 
  ModerationResult, 
  ModerationCategory,
  RewriteResult,
  ModerationError 
} from '../../src/ports/moderation';
import OpenAI from 'openai';
import { Logger } from '../../src/logging/logger';

// OpenAI SDKのモック
jest.mock('openai');

describe('OpenAIModerationAdapter', () => {
  let adapter: OpenAIModerationAdapter;
  let mockOpenAI: any;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // モックOpenAIクライアント
    mockOpenAI = {
      moderations: {
        create: jest.fn(),
      },
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    // OpenAIコンストラクタのモック
    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);

    adapter = new OpenAIModerationAdapter({
      apiKey: 'test-api-key',
      model: 'gpt-4o-mini',
      logger: mockLogger,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('APIキーで初期化できること', () => {
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
      });
    });

    test('デフォルト設定が適用されること', () => {
      const defaultAdapter = new OpenAIModerationAdapter({
        apiKey: 'test-key',
      });

      expect(defaultAdapter).toBeDefined();
    });
  });

  describe('moderate', () => {
    test('安全なコンテンツを検証できること', async () => {
      const mockResponse = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [{
          flagged: false,
          categories: {
            sexual: false,
            hate: false,
            harassment: false,
            'self-harm': false,
            'sexual/minors': false,
            'hate/threatening': false,
            'violence/graphic': false,
            'self-harm/intent': false,
            'self-harm/instructions': false,
            'harassment/threatening': false,
            violence: false,
          },
          category_scores: {
            sexual: 0.0001,
            hate: 0.0002,
            harassment: 0.0001,
            'self-harm': 0.0000,
            'sexual/minors': 0.0000,
            'hate/threatening': 0.0000,
            'violence/graphic': 0.0000,
            'self-harm/intent': 0.0000,
            'self-harm/instructions': 0.0000,
            'harassment/threatening': 0.0000,
            violence: 0.0001,
          },
        }],
      };

      mockOpenAI.moderations.create.mockResolvedValue(mockResponse);

      const result = await adapter.moderate('こんにちは！今日も頑張りましょう！');

      expect(result).toEqual<ModerationResult>({
        flagged: false,
        scores: {
          hate: 0.0002,
          harassment: 0.0001,
          selfHarm: 0.0000,
          sexual: 0.0001,
          violence: 0.0001,
          illegal: 0.0,
          graphic: 0.0,
        },
        flaggedCategories: [],
        suggestedAction: 'approve',
      });
    });

    test('不適切なコンテンツを検出できること', async () => {
      const mockResponse = {
        id: 'modr-456',
        model: 'text-moderation-latest',
        results: [{
          flagged: true,
          categories: {
            sexual: false,
            hate: true,
            harassment: true,
            'self-harm': false,
            'sexual/minors': false,
            'hate/threatening': false,
            'violence/graphic': false,
            'self-harm/intent': false,
            'self-harm/instructions': false,
            'harassment/threatening': false,
            violence: false,
          },
          category_scores: {
            sexual: 0.01,
            hate: 0.85,
            harassment: 0.75,
            'self-harm': 0.001,
            'sexual/minors': 0.001,
            'hate/threatening': 0.1,
            'violence/graphic': 0.001,
            'self-harm/intent': 0.001,
            'self-harm/instructions': 0.001,
            'harassment/threatening': 0.15,
            violence: 0.05,
          },
        }],
      };

      mockOpenAI.moderations.create.mockResolvedValue(mockResponse);

      const result = await adapter.moderate('不適切なコンテンツの例');

      expect(result.flagged).toBe(true);
      expect(result.flaggedCategories).toContain(ModerationCategory.HATE);
      expect(result.flaggedCategories).toContain(ModerationCategory.HARASSMENT);
      expect(result.suggestedAction).toBe('block');
    });

    test('APIエラーをハンドリングできること', async () => {
      const apiError: any = new Error('Rate limit exceeded');
      apiError.status = 429;
      
      mockOpenAI.moderations.create.mockRejectedValue(apiError);

      await expect(adapter.moderate('テストコンテンツ'))
        .rejects.toThrow(ModerationError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'OpenAI moderation error',
        apiError
      );
    });

    test('コンテキストを考慮したモデレーションができること', async () => {
      const mockResponse = {
        id: 'modr-789',
        model: 'text-moderation-latest',
        results: [{
          flagged: false,
          categories: {
            sexual: false,
            hate: false,
            harassment: false,
            'self-harm': false,
            'sexual/minors': false,
            'hate/threatening': false,
            'violence/graphic': false,
            'self-harm/intent': false,
            'self-harm/instructions': false,
            'harassment/threatening': false,
            violence: false,
          },
          category_scores: {
            sexual: 0.001,
            hate: 0.002,
            harassment: 0.001,
            'self-harm': 0.000,
            'sexual/minors': 0.000,
            'hate/threatening': 0.000,
            'violence/graphic': 0.000,
            'self-harm/intent': 0.000,
            'self-harm/instructions': 0.000,
            'harassment/threatening': 0.000,
            violence: 0.001,
          },
        }],
      };

      mockOpenAI.moderations.create.mockResolvedValue(mockResponse);

      const result = await adapter.moderate(
        'ゲームで敵を倒す', 
        'ゲーム実況中'
      );

      expect(result.flagged).toBe(false);
      expect(mockOpenAI.moderations.create).toHaveBeenCalledWith({
        input: 'ゲームで敵を倒す',
      });
    });
  });

  describe('moderateBatch', () => {
    test('複数のコンテンツを一括でモデレートできること', async () => {
      const mockResponse = {
        id: 'modr-batch',
        model: 'text-moderation-latest',
        results: [
          {
            flagged: false,
            categories: {
              sexual: false,
              hate: false,
              harassment: false,
              'self-harm': false,
              'sexual/minors': false,
              'hate/threatening': false,
              'violence/graphic': false,
              'self-harm/intent': false,
              'self-harm/instructions': false,
              'harassment/threatening': false,
              violence: false,
            },
            category_scores: {
              sexual: 0.001,
              hate: 0.001,
              harassment: 0.001,
              'self-harm': 0.000,
              'sexual/minors': 0.000,
              'hate/threatening': 0.000,
              'violence/graphic': 0.000,
              'self-harm/intent': 0.000,
              'self-harm/instructions': 0.000,
              'harassment/threatening': 0.000,
              violence: 0.001,
            },
          },
          {
            flagged: true,
            categories: {
              sexual: false,
              hate: true,
              harassment: false,
              'self-harm': false,
              'sexual/minors': false,
              'hate/threatening': false,
              'violence/graphic': false,
              'self-harm/intent': false,
              'self-harm/instructions': false,
              'harassment/threatening': false,
              violence: false,
            },
            category_scores: {
              sexual: 0.001,
              hate: 0.8,
              harassment: 0.1,
              'self-harm': 0.000,
              'sexual/minors': 0.000,
              'hate/threatening': 0.000,
              'violence/graphic': 0.000,
              'self-harm/intent': 0.000,
              'self-harm/instructions': 0.000,
              'harassment/threatening': 0.000,
              violence: 0.001,
            },
          },
          {
            flagged: false,
            categories: {
              sexual: false,
              hate: false,
              harassment: false,
              'self-harm': false,
              'sexual/minors': false,
              'hate/threatening': false,
              'violence/graphic': false,
              'self-harm/intent': false,
              'self-harm/instructions': false,
              'harassment/threatening': false,
              violence: false,
            },
            category_scores: {
              sexual: 0.002,
              hate: 0.002,
              harassment: 0.002,
              'self-harm': 0.000,
              'sexual/minors': 0.000,
              'hate/threatening': 0.000,
              'violence/graphic': 0.000,
              'self-harm/intent': 0.000,
              'self-harm/instructions': 0.000,
              'harassment/threatening': 0.000,
              violence: 0.002,
            },
          },
        ],
      };

      mockOpenAI.moderations.create.mockResolvedValue(mockResponse);

      const contents = [
        'おはようございます',
        '不適切な内容',
        'よろしくお願いします',
      ];

      const results = await adapter.moderateBatch(contents);

      expect(results).toHaveLength(3);
      expect(results[0]?.flagged).toBe(false);
      expect(results[1]?.flagged).toBe(true);
      expect(results[2]?.flagged).toBe(false);

      expect(mockOpenAI.moderations.create).toHaveBeenCalledWith({
        input: contents,
      });
    });

    test('空の配列を処理できること', async () => {
      const results = await adapter.moderateBatch([]);

      expect(results).toEqual([]);
      expect(mockOpenAI.moderations.create).not.toHaveBeenCalled();
    });
  });

  describe('rewriteContent', () => {
    test('不適切なコンテンツを書き換えできること', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              rewritten: 'もっと仲良くしましょう！',
              explanation: '攻撃的な表現を友好的に変更しました',
            }),
          },
          finish_reason: 'stop',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.rewriteContent(
        '攻撃的な表現を含むテキスト',
        'ポジティブで友好的な表現に書き換えてください'
      );

      expect(result).toEqual<RewriteResult>({
        original: '攻撃的な表現を含むテキスト',
        rewritten: 'もっと仲良くしましょう！',
        wasRewritten: true,
      });
    });

    test('書き換え不要な場合は元のテキストを返すこと', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              rewritten: 'こんにちは！',
              explanation: '問題のない内容なので変更なし',
            }),
          },
          finish_reason: 'stop',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.rewriteContent(
        'こんにちは！',
        'ポジティブで友好的な表現に書き換えてください'
      );

      expect(result).toEqual<RewriteResult>({
        original: 'こんにちは！',
        rewritten: 'こんにちは！',
        wasRewritten: false,
      });
    });

    test('JSONパースエラーをハンドリングできること', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '書き換えたテキスト',
          },
          finish_reason: 'stop',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.rewriteContent(
        '元のテキスト',
        'ガイドライン'
      );

      expect(result).toEqual<RewriteResult>({
        original: '元のテキスト',
        rewritten: '書き換えたテキスト',
        wasRewritten: true,
      });
    });
  });

  describe('isHealthy', () => {
    test('正常な状態を報告できること', async () => {
      const mockResponse = {
        id: 'modr-health',
        model: 'text-moderation-latest',
        results: [{
          flagged: false,
          categories: {
            sexual: false,
            hate: false,
            harassment: false,
            'self-harm': false,
            'sexual/minors': false,
            'hate/threatening': false,
            'violence/graphic': false,
            'self-harm/intent': false,
            'self-harm/instructions': false,
            'harassment/threatening': false,
            violence: false,
          },
          category_scores: {
            sexual: 0.0,
            hate: 0.0,
            harassment: 0.0,
            'self-harm': 0.0,
            'sexual/minors': 0.0,
            'hate/threatening': 0.0,
            'violence/graphic': 0.0,
            'self-harm/intent': 0.0,
            'self-harm/instructions': 0.0,
            'harassment/threatening': 0.0,
            violence: 0.0,
          },
        }],
      };

      mockOpenAI.moderations.create.mockResolvedValue(mockResponse);

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(true);
    });

    test('APIエラー時は異常と報告すること', async () => {
      mockOpenAI.moderations.create.mockRejectedValue(
        new Error('API key invalid')
      );

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'OpenAI moderation health check failed',
        expect.any(Error)
      );
    });
  });

  describe('Error handling', () => {
    test('レート制限エラーをリトライ可能として処理すること', async () => {
      const rateLimitError: any = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      mockOpenAI.moderations.create.mockRejectedValue(rateLimitError);

      try {
        await adapter.moderate('test');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ModerationError);
        expect(error.isRetryable).toBe(true);
      }
    });

    test('認証エラーをリトライ不可能として処理すること', async () => {
      const authError: any = new Error('Invalid API key');
      authError.status = 401;
      mockOpenAI.moderations.create.mockRejectedValue(authError);

      try {
        await adapter.moderate('test');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ModerationError);
        expect(error.isRetryable).toBe(false);
      }
    });
  });

  describe('Category mapping', () => {
    test('OpenAIカテゴリを内部カテゴリにマッピングできること', async () => {
      const mockResponse = {
        id: 'modr-map',
        model: 'text-moderation-latest',
        results: [{
          flagged: true,
          categories: {
            sexual: true,
            hate: false,
            harassment: false,
            'self-harm': true,
            'sexual/minors': true,
            'hate/threatening': false,
            'violence/graphic': true,
            'self-harm/intent': false,
            'self-harm/instructions': false,
            'harassment/threatening': false,
            violence: false,
          },
          category_scores: {
            sexual: 0.9,
            hate: 0.1,
            harassment: 0.1,
            'self-harm': 0.8,
            'sexual/minors': 0.9,
            'hate/threatening': 0.1,
            'violence/graphic': 0.85,
            'self-harm/intent': 0.1,
            'self-harm/instructions': 0.1,
            'harassment/threatening': 0.1,
            violence: 0.1,
          },
        }],
      };

      mockOpenAI.moderations.create.mockResolvedValue(mockResponse);

      const result = await adapter.moderate('テスト');

      expect(result.flaggedCategories).toContain(ModerationCategory.SEXUAL);
      expect(result.flaggedCategories).toContain(ModerationCategory.SELF_HARM);
      expect(result.flaggedCategories).toContain(ModerationCategory.GRAPHIC);
      expect(result.scores.sexual).toBe(0.9);
      expect(result.scores.selfHarm).toBe(0.8);
      expect(result.scores.graphic).toBe(0.85);
    });
  });
});
