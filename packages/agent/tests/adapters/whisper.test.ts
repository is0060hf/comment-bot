/**
 * Tsumiki AITDD - Red Phase
 * タスク49: OpenAI Whisperアダプタのテストケース
 */

import { WhisperAdapter } from '../../src/adapters/whisper';
import { STTPort, STTResult, STTError } from '../../src/ports/stt';
import OpenAI from 'openai';
import { Transform } from 'stream';
import FormData from 'form-data';

// OpenAI SDKのモック
jest.mock('openai');
jest.mock('form-data');

describe('WhisperAdapter', () => {
  let adapter: WhisperAdapter;
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
      audio: {
        transcriptions: {
          create: jest.fn(),
        },
      },
    };

    // OpenAIコンストラクタのモック
    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);

    adapter = new WhisperAdapter({
      apiKey: 'test-api-key',
      model: 'whisper-1',
      language: 'ja',
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
      const defaultAdapter = new WhisperAdapter({
        apiKey: 'test-key',
      });

      expect(defaultAdapter).toBeDefined();
    });
  });

  describe('transcribe', () => {
    test('音声バッファを文字起こしできること', async () => {
      const audioBuffer = Buffer.from('fake-audio-data');
      const mockResponse = {
        text: 'OpenAI Whisperによる文字起こしテスト',
        segments: [
          {
            text: 'OpenAI Whisperによる',
            start: 0,
            end: 1.5,
            avg_logprob: -0.2,
          },
          {
            text: '文字起こしテスト',
            start: 1.5,
            end: 3.0,
            avg_logprob: -0.15,
          },
        ],
        language: 'japanese',
        duration: 3.0,
      };

      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const result = await adapter.transcribe(audioBuffer);

      expect(result).toEqual<STTResult>({
        transcript: 'OpenAI Whisperによる文字起こしテスト',
        confidence: expect.any(Number), // log probabilityから計算
        segments: [
          {
            text: 'OpenAI Whisperによる',
            startTime: 0,
            endTime: 1.5,
            confidence: expect.any(Number),
          },
          {
            text: '文字起こしテスト',
            startTime: 1.5,
            endTime: 3.0,
            confidence: expect.any(Number),
          },
        ],
        timestamp: expect.any(Number),
        provider: 'whisper',
      });

      // FormDataの使用を確認
      const callArgs = mockOpenAI.audio.transcriptions.create.mock.calls[0][0];
      expect(callArgs.file).toBeDefined();
      expect(callArgs.model).toBe('whisper-1');
      expect(callArgs.language).toBe('ja');
      expect(callArgs.response_format).toBe('verbose_json');
    });

    test('シンプルなテキスト応答を処理できること', async () => {
      const audioBuffer = Buffer.from('audio');
      const mockResponse = {
        text: 'シンプルなテキスト',
      };

      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const result = await adapter.transcribe(audioBuffer);

      expect(result.transcript).toBe('シンプルなテキスト');
      expect(result.confidence).toBe(0.9); // デフォルト
      expect(result.segments).toEqual([{
        text: 'シンプルなテキスト',
        startTime: 0,
        endTime: 0,
        confidence: 0.9,
      }]);
    });

    test('空の結果を処理できること', async () => {
      const audioBuffer = Buffer.from('silence');
      const mockResponse = {
        text: '',
      };

      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const result = await adapter.transcribe(audioBuffer);

      expect(result.transcript).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.segments).toEqual([]);
    });

    test('APIエラーをハンドリングできること', async () => {
      const audioBuffer = Buffer.from('audio');
      const apiError: any = new Error('Rate limit exceeded');
      apiError.status = 429;
      
      mockOpenAI.audio.transcriptions.create.mockRejectedValue(apiError);

      await expect(adapter.transcribe(audioBuffer))
        .rejects.toThrow('Whisper transcription failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Whisper transcription error',
        apiError
      );
    });

    test('タイムスタンプ付きの詳細な結果を処理できること', async () => {
      const audioBuffer = Buffer.from('audio');
      const mockResponse = {
        text: '詳細な文字起こし結果',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0.0,
            end: 2.5,
            text: '詳細な',
            tokens: [123, 456],
            temperature: 0.0,
            avg_logprob: -0.25,
            compression_ratio: 1.2,
            no_speech_prob: 0.01,
          },
          {
            id: 1,
            seek: 250,
            start: 2.5,
            end: 5.0,
            text: '文字起こし結果',
            tokens: [789, 101112],
            temperature: 0.0,
            avg_logprob: -0.18,
            compression_ratio: 1.3,
            no_speech_prob: 0.02,
          },
        ],
        language: 'ja',
        duration: 5.0,
      };

      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const result = await adapter.transcribe(audioBuffer);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]!.confidence).toBeGreaterThan(0.7);
      expect(result.segments[1]!.confidence).toBeGreaterThan(0.7);
    });

    test('カスタムプロンプトを使用できること', async () => {
      const audioBuffer = Buffer.from('audio');
      const mockResponse = {
        text: 'カスタムプロンプトの結果',
      };

      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

      await adapter.transcribe(audioBuffer, {
        prompt: '技術用語: API, SDK, TypeScript',
        temperature: 0.2,
      });

      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: '技術用語: API, SDK, TypeScript',
          temperature: 0.2,
        })
      );
    });

    test('大きなファイルサイズを処理できること', async () => {
      // 25MB以上のバッファ（Whisperの上限）
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024);
      
      await expect(adapter.transcribe(largeBuffer))
        .rejects.toThrow('Audio file too large');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Audio file too large'),
        expect.objectContaining({
          size: 26 * 1024 * 1024,
          maxSize: 25 * 1024 * 1024,
        })
      );
    });
  });

  describe('startStreaming', () => {
    test('ストリーミングがサポートされていないことを通知すること', async () => {
      const transform = new Transform();

      await expect(adapter.startStreaming(transform))
        .rejects.toThrow('Whisper does not support streaming');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Whisper streaming not supported, falling back to batch processing'
      );
    });

    test('バッチ処理へのフォールバックを実装すること', async () => {
      const transform = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });

      // チャンクバッファリング用の実装
      const chunks: Buffer[] = [];
      transform.on('data', (chunk) => chunks.push(chunk));

      // ストリーミングの代わりにバッチ処理
      const mockResponse = {
        text: 'バッチ処理の結果',
      };
      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

      // 音声データの蓄積と処理をシミュレート
      const audioChunk1 = Buffer.from('chunk1');
      const audioChunk2 = Buffer.from('chunk2');
      
      transform.write(audioChunk1);
      transform.write(audioChunk2);
      transform.end();

      // バッファがいっぱいになったら処理
      const fullBuffer = Buffer.concat([audioChunk1, audioChunk2]);
      const result = await adapter.transcribe(fullBuffer);

      expect(result.transcript).toBe('バッチ処理の結果');
    });
  });

  describe('isHealthy', () => {
    test('正常な状態を報告できること', async () => {
      // ヘルスチェック用の小さな音声
      const testAudio = Buffer.from('test');
      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'test',
      });

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(true);
    });

    test('APIエラー時は異常と報告すること', async () => {
      mockOpenAI.audio.transcriptions.create.mockRejectedValue(
        new Error('Invalid API key')
      );

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Whisper health check failed',
        expect.any(Error)
      );
    });
  });

  describe('Error handling', () => {
    test('レート制限エラーをリトライ可能エラーとして分類すること', async () => {
      const rateLimitError: any = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      mockOpenAI.audio.transcriptions.create.mockRejectedValue(rateLimitError);

      try {
        await adapter.transcribe(Buffer.from('audio'));
      } catch (error) {
        expect(error).toBeInstanceOf(STTError);
        expect((error as STTError).isRetryable).toBe(true);
      }
    });

    test('認証エラーをリトライ不可能エラーとして分類すること', async () => {
      const authError: any = new Error('Incorrect API key');
      authError.status = 401;
      mockOpenAI.audio.transcriptions.create.mockRejectedValue(authError);

      try {
        await adapter.transcribe(Buffer.from('audio'));
      } catch (error) {
        expect(error).toBeInstanceOf(STTError);
        expect((error as STTError).isRetryable).toBe(false);
      }
    });

    test('タイムアウトエラーをリトライ可能エラーとして分類すること', async () => {
      const timeoutError: any = new Error('Request timeout');
      timeoutError.code = 'ETIMEDOUT';
      mockOpenAI.audio.transcriptions.create.mockRejectedValue(timeoutError);

      try {
        await adapter.transcribe(Buffer.from('audio'));
      } catch (error) {
        expect(error).toBeInstanceOf(STTError);
        expect((error as STTError).isRetryable).toBe(true);
      }
    });
  });

  describe('Language detection', () => {
    test('言語を自動検出できること', async () => {
      const audioBuffer = Buffer.from('multilingual-audio');
      const mockResponse = {
        text: 'Hello, こんにちは',
        language: 'japanese',
      };

      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

      // 言語指定なしでリクエスト
      const adapterWithoutLang = new WhisperAdapter({
        apiKey: 'test-key',
        logger: mockLogger,
      });

      const result = await adapterWithoutLang.transcribe(audioBuffer);

      expect(result.language).toBe('japanese');
      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ language: expect.any(String) })
      );
    });
  });
});
