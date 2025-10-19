/**
 * Tsumiki AITDD - Red Phase
 * タスク50: OpenAI LLMアダプタのテストケース
 */

import { OpenAILLMAdapter } from '../../src/adapters/openai-llm';
import { 
  LLMPort, 
  CommentGenerationContext, 
  CommentOpportunityContext,
  LLMMessage,
  CommentGenerationResult,
  CommentClassificationResult,
  LLMError 
} from '../../src/ports/llm';
import OpenAI from 'openai';
import { Logger } from '../../src/logging/logger';

// OpenAI SDKのモック
jest.mock('openai');

describe('OpenAILLMAdapter', () => {
  let adapter: OpenAILLMAdapter;
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
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    // OpenAIコンストラクタのモック
    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);

    adapter = new OpenAILLMAdapter({
      apiKey: 'test-api-key',
      model: 'gpt-4o-mini',
      maxTokens: 100,
      temperature: 0.7,
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
      const defaultAdapter = new OpenAILLMAdapter({
        apiKey: 'test-key',
      });

      expect(defaultAdapter).toBeDefined();
    });
  });

  describe('generateComment', () => {
    test('コンテキストに基づいてコメントを生成できること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: ['ゲーム', '新作', '実況'],
        keywords: ['RPG', 'アクション'],
        streamTitle: '【新作RPG】初見プレイ実況',
        policy: {
          tone: 'friendly',
          characterPersona: 'フレンドリーな視聴者',
          targetLength: {
            min: 20,
            max: 100,
          },
          encouragedExpressions: ['楽しみ', 'わくわく'],
        },
      };

      const mockResponse = {
        choices: [{
          message: {
            content: 'わー！新作RPG楽しみですね！どんなゲームか気になります〜',
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 20,
          total_tokens: 70,
        },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.generateComment(context);

      expect(result).toEqual<CommentGenerationResult>({
        comment: 'わー！新作RPG楽しみですね！どんなゲームか気になります〜',
        confidence: expect.any(Number),
      });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
        max_tokens: 100,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });
    });

    test('空のコンテキストでも動作すること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: [],
        keywords: [],
        streamTitle: '',
        policy: {
          tone: 'neutral',
          characterPersona: '一般的な視聴者',
          targetLength: {
            min: 20,
            max: 100,
          },
          encouragedExpressions: [],
        },
      };

      const mockResponse = {
        choices: [{
          message: {
            content: '配信お疲れ様です！',
          },
          finish_reason: 'stop',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.generateComment(context);

      expect(result.comment).toBe('配信お疲れ様です！');
    });

    test('APIエラーをハンドリングできること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: [],
        keywords: [],
        streamTitle: 'テスト配信',
        policy: {
          tone: 'friendly',
          characterPersona: 'フレンドリーな視聴者',
          targetLength: {
            min: 20,
            max: 100,
          },
          encouragedExpressions: [],
        },
      };

      const apiError: any = new Error('Rate limit exceeded');
      apiError.status = 429;
      
      mockOpenAI.chat.completions.create.mockRejectedValue(apiError);

      await expect(adapter.generateComment(context))
        .rejects.toThrow('Failed to generate comment');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'OpenAI comment generation error',
        apiError
      );
    });

    test('JSONモードで構造化された応答を処理できること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: [],
        keywords: [],
        streamTitle: 'テスト',
        policy: {
          tone: 'friendly',
          characterPersona: 'フレンドリーな視聴者',
          targetLength: {
            min: 20,
            max: 100,
          },
          encouragedExpressions: [],
        },
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              comment: '構造化されたコメントです',
              confidence: 0.85,
              reasoning: 'テストコンテキストに基づいて生成',
            }),
          },
          finish_reason: 'stop',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.generateComment(context);

      expect(result).toEqual<CommentGenerationResult>({
        comment: '構造化されたコメントです',
        confidence: 0.85,
      });
    });
  });

  describe('classifyCommentOpportunity', () => {
    test('コメント機会を分類できること', async () => {
      const context: CommentOpportunityContext = {
        transcript: 'それでは質問コーナーに移ります。何か聞きたいことはありますか？',
        recentTopics: ['ゲーム実況', '質問コーナー'],
        engagementLevel: 0.8,
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              classification: 'necessary',
              confidence: 0.9,
              reasoning: '質問を募集しているタイミングで、視聴者参加が期待される',
            }),
          },
          finish_reason: 'stop',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.classifyCommentOpportunity(context);

      expect(result.classification).toBe('necessary');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
        })
      );
    });

    test('低エンゲージメント時は控えめに分類すること', async () => {
      const context: CommentOpportunityContext = {
        transcript: '今は集中して作業しています',
        recentTopics: ['作業', '集中'],
        engagementLevel: 0.2,
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              classification: 'unnecessary',
              confidence: 0.85,
              reasoning: '配信者が集中しており、エンゲージメントも低い',
            }),
          },
          finish_reason: 'stop',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.classifyCommentOpportunity(context);

      expect(result.classification).toBe('unnecessary');
    });

    test('無効な分類結果をデフォルト値で処理すること', async () => {
      const context: CommentOpportunityContext = {
        transcript: 'テスト',
        recentTopics: [],
        engagementLevel: 0.5,
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              classification: 'invalid_value',
              confidence: 0.5,
            }),
          },
          finish_reason: 'stop',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.classifyCommentOpportunity(context);

      expect(result.classification).toBe('hold'); // デフォルト値
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid classification'),
        expect.any(Object)
      );
    });
  });

  describe('chat', () => {
    test('汎用的なチャット応答を生成できること', async () => {
      const messages: LLMMessage[] = [
        { role: 'system', content: 'あなたは親切なアシスタントです。' },
        { role: 'user', content: 'こんにちは！' },
      ];

      const mockResponse = {
        choices: [{
          message: {
            content: 'こんにちは！今日はどのようなお手伝いができますか？',
            role: 'assistant',
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 15,
          total_tokens: 35,
        },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.chat(messages);

      expect(result.message).toEqual({
        role: 'assistant',
        content: 'こんにちは！今日はどのようなお手伝いができますか？',
      });
      expect(result.usage).toEqual({
        promptTokens: 20,
        completionTokens: 15,
        totalTokens: 35,
      });
    });

    test('ストリーミング応答を処理できること', async () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'ストリーミングテスト' },
      ];

      // ストリーミングレスポンスのモック
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'これは' } }] };
          yield { choices: [{ delta: { content: 'ストリーミング' } }] };
          yield { choices: [{ delta: { content: 'です' } }] };
          yield { choices: [{ finish_reason: 'stop' }] };
        },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      const result = await adapter.chat(messages, { stream: true });

      expect(result.message.content).toBe('これはストリーミングです');
      expect(result.message.role).toBe('assistant');
    });
  });

  describe('isHealthy', () => {
    test('正常な状態を報告できること', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'test' },
          finish_reason: 'stop',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(true);
    });

    test('APIエラー時は異常と報告すること', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('API key invalid')
      );

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'OpenAI health check failed',
        expect.any(Error)
      );
    });
  });

  describe('Error handling', () => {
    test('レート制限エラーをリトライ可能として処理すること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: [],
        keywords: [],
        streamTitle: 'test',
        policy: {
          tone: 'friendly',
          characterPersona: 'フレンドリーな視聴者',
          targetLength: {
            min: 20,
            max: 100,
          },
          encouragedExpressions: [],
        },
      };

      const rateLimitError: any = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      mockOpenAI.chat.completions.create.mockRejectedValue(rateLimitError);

      try {
        await adapter.generateComment(context);
      } catch (error: any) {
        expect(error.isRetryable).toBe(true);
      }
    });

    test('認証エラーをリトライ不可能として処理すること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: [],
        keywords: [],
        streamTitle: 'test',
        policy: {
          tone: 'friendly',
          characterPersona: 'フレンドリーな視聴者',
          targetLength: {
            min: 20,
            max: 100,
          },
          encouragedExpressions: [],
        },
      };

      const authError: any = new Error('Invalid API key');
      authError.status = 401;
      mockOpenAI.chat.completions.create.mockRejectedValue(authError);

      try {
        await adapter.generateComment(context);
      } catch (error: any) {
        expect(error.isRetryable).toBe(false);
      }
    });
  });

  describe('Token management', () => {
    test('トークン使用量を追跡できること', async () => {
      const context: CommentGenerationContext = {
        recentTopics: [],
        keywords: [],
        streamTitle: 'test',
        policy: {
          tone: 'friendly',
          characterPersona: 'フレンドリーな視聴者',
          targetLength: {
            min: 20,
            max: 100,
          },
          encouragedExpressions: [],
        },
      };

      const mockResponse = {
        choices: [{
          message: { content: 'テストコメント' },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
        },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      await adapter.generateComment(context);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'OpenAI token usage',
        expect.objectContaining({
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
        })
      );
    });

    test('最大トークン数を超えないように制限すること', async () => {
      const longContext: CommentGenerationContext = {
        recentTopics: Array(50).fill('トピック'),
        keywords: Array(100).fill('キーワード'),
        streamTitle: 'very long title',
        policy: {
          tone: 'friendly',
          characterPersona: 'フレンドリーな視聴者',
          targetLength: {
            min: 20,
            max: 100,
          },
          encouragedExpressions: [],
        },
      };

      const mockResponse = {
        choices: [{
          message: { content: '短いコメント' },
          finish_reason: 'length',
        }],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await adapter.generateComment(longContext);

      expect(result.comment).toBe('短いコメント');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Token limit reached')
      );
    });
  });
});
