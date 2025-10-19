/**
 * Tsumiki AITDD - Red Phase
 * タスク49: Deepgramアダプタのテストケース
 */

import { DeepgramAdapter } from '../../src/adapters/deepgram';
import { STTPort, STTResult, STTError } from '../../src/ports/stt';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter, Transform } from 'stream';

// Deepgram SDKのモック
jest.mock('@deepgram/sdk');

describe('DeepgramAdapter', () => {
  let adapter: DeepgramAdapter;
  let mockClient: any;
  let mockConnection: any;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // モックコネクション（EventEmitter）
    mockConnection = new EventEmitter();
    mockConnection.send = jest.fn();
    mockConnection.finish = jest.fn();

    // モッククライアント
    mockClient = {
      listen: {
        prerecorded: {
          transcribeFile: jest.fn(),
        },
        live: jest.fn().mockReturnValue(mockConnection),
      },
    };

    // createClientのモック
    (createClient as jest.MockedFunction<typeof createClient>).mockReturnValue(mockClient);

    adapter = new DeepgramAdapter({
      apiKey: 'test-api-key',
      model: 'nova-2',
      language: 'ja',
      logger: mockLogger,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('APIキーで初期化できること', () => {
      expect(createClient).toHaveBeenCalledWith('test-api-key');
    });

    test('デフォルト設定が適用されること', () => {
      const defaultAdapter = new DeepgramAdapter({
        apiKey: 'test-key',
      });

      expect(defaultAdapter).toBeDefined();
    });
  });

  describe('transcribe', () => {
    test('音声バッファを文字起こしできること', async () => {
      const audioBuffer = Buffer.from('fake-audio-data');
      const mockResponse = {
        results: {
          channels: [{
            alternatives: [{
              transcript: 'こんにちは、世界',
              confidence: 0.95,
              words: [
                { word: 'こんにちは', start: 0, end: 0.5, confidence: 0.95 },
                { word: '世界', start: 0.6, end: 1.0, confidence: 0.95 },
              ],
            }],
          }],
        },
      };

      mockClient.listen.prerecorded.transcribeFile.mockResolvedValue(mockResponse);

      const result = await adapter.transcribe(audioBuffer);

      expect(result).toEqual<STTResult>({
        transcript: 'こんにちは、世界',
        confidence: 0.95,
        segments: [
          {
            text: 'こんにちは',
            startTime: 0,
            endTime: 0.5,
            confidence: 0.95,
          },
          {
            text: '世界',
            startTime: 0.6,
            endTime: 1.0,
            confidence: 0.95,
          }
        ],
        timestamp: expect.any(Number),
        provider: 'deepgram',
      });

      expect(mockClient.listen.prerecorded.transcribeFile).toHaveBeenCalledWith(
        audioBuffer,
        {
          model: 'nova-2',
          language: 'ja',
          punctuate: true,
          utterances: true,
          diarize: false,
          mimetype: 'audio/wav',
        }
      );
    });

    test('空の結果を処理できること', async () => {
      const audioBuffer = Buffer.from('silence');
      const mockResponse = {
        results: {
          channels: [{
            alternatives: [{
              transcript: '',
              confidence: 0,
              words: [],
            }],
          }],
        },
      };

      mockClient.listen.prerecorded.transcribeFile.mockResolvedValue(mockResponse);

      const result = await adapter.transcribe(audioBuffer);

      expect(result.transcript).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.segments).toEqual([]);
    });

    test('APIエラーをハンドリングできること', async () => {
      const audioBuffer = Buffer.from('audio');
      const apiError = new Error('API rate limit exceeded');
      
      mockClient.listen.prerecorded.transcribeFile.mockRejectedValue(apiError);

      await expect(adapter.transcribe(audioBuffer))
        .rejects.toThrow('Deepgram transcription failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Deepgram transcription error',
        apiError
      );
    });

    test('カスタムオプションを渡せること', async () => {
      const audioBuffer = Buffer.from('audio');
      const mockResponse = {
        results: {
          channels: [{
            alternatives: [{
              transcript: 'テスト',
              confidence: 0.9,
              words: [],
            }],
          }],
        },
      };

      mockClient.listen.prerecorded.transcribeFile.mockResolvedValue(mockResponse);

      await adapter.transcribe(audioBuffer, {
        diarize: true,
        punctuate: false,
        model: 'enhanced',
      });

      expect(mockClient.listen.prerecorded.transcribeFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          diarize: true,
          punctuate: false,
          model: 'enhanced',
          mimetype: 'audio/wav',
        })
      );
    });
  });

  describe('startStreaming', () => {
    test('ストリーミング文字起こしを開始できること', async () => {
      const transform = new Transform({
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });

      const stream = await adapter.startStreaming(transform);

      expect(stream).toBe(transform);
      expect(mockClient.listen.live).toHaveBeenCalledWith({
        model: 'nova-2',
        language: 'ja',
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        encoding: 'linear16',
        sample_rate: 16000,
      });
    });

    test('文字起こし結果を受信できること', async () => {
      const transform = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });

      const results: STTResult[] = [];
      transform.on('data', (data) => results.push(data));

      await adapter.startStreaming(transform);

      // Deepgramからの結果をシミュレート
      const mockResult = {
        channel: {
          alternatives: [{
            transcript: 'ストリーミングテスト',
            confidence: 0.92,
            words: [
              { word: 'ストリーミング', start: 0, end: 0.8, confidence: 0.92 },
              { word: 'テスト', start: 0.9, end: 1.2, confidence: 0.92 },
            ],
          }],
        },
        is_final: true,
        speech_final: true,
      };

      mockConnection.emit(LiveTranscriptionEvents.Transcript, mockResult);

      await new Promise(resolve => setImmediate(resolve));

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        transcript: 'ストリーミングテスト',
        confidence: 0.92,
        provider: 'deepgram',
      });
    });

    test('中間結果を処理できること', async () => {
      const transform = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });

      const results: STTResult[] = [];
      transform.on('data', (data) => results.push(data));

      await adapter.startStreaming(transform);

      // 中間結果
      const interimResult = {
        channel: {
          alternatives: [{
            transcript: 'これは',
            confidence: 0.8,
            words: [],
          }],
        },
        is_final: false,
        speech_final: false,
      };

      mockConnection.emit(LiveTranscriptionEvents.Transcript, interimResult);

      await new Promise(resolve => setImmediate(resolve));

      expect(results).toHaveLength(1);
      expect(results[0]!.isFinal).toBe(false);
    });

    test('VADイベントを処理できること', async () => {
      const transform = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });

      await adapter.startStreaming(transform);

      // VADイベント
      const vadEvent = {
        type: 'speech_started',
        timestamp: 1234567890,
      };

      mockConnection.emit(LiveTranscriptionEvents.Metadata, vadEvent);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Deepgram VAD event',
        { type: 'speech_started' }
      );
    });

    test('接続エラーをハンドリングできること', async () => {
      const transform = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });

      const errors: Error[] = [];
      transform.on('error', (error) => errors.push(error));

      await adapter.startStreaming(transform);

      const connectionError = new Error('WebSocket connection failed');
      mockConnection.emit('error', connectionError);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Deepgram streaming error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Deepgram streaming error',
        connectionError
      );
    });

    test('音声データを送信できること', async () => {
      const transform = new Transform({
        transform(chunk, _encoding, callback) {
          // 音声データをDeepgramに送信
          this.push(chunk);
          callback();
        },
      });

      // transformにsendメソッドを追加
      (transform as any).send = (data: Buffer) => {
        mockConnection.send(data);
      };

      await adapter.startStreaming(transform);

      const audioChunk = Buffer.from('audio-chunk');
      transform.write(audioChunk);

      // パイプライン経由でDeepgramに送信されることを確認
      expect(mockConnection.send).toHaveBeenCalledWith(audioChunk);
    });

    test('ストリームを正常に終了できること', async () => {
      const transform = new Transform({
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });

      await adapter.startStreaming(transform);

      // endイベントを発火
      transform.emit('end');

      expect(mockConnection.finish).toHaveBeenCalled();
    });
  });

  describe('isHealthy', () => {
    test('正常な状態を報告できること', async () => {
      // ヘルスチェック用のモックレスポンス
      mockClient.listen.prerecorded.transcribeFile.mockResolvedValue({
        results: { channels: [{ alternatives: [{ transcript: '' }] }] },
      });

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(true);
    });

    test('APIエラー時は異常と報告すること', async () => {
      mockClient.listen.prerecorded.transcribeFile.mockRejectedValue(
        new Error('Authentication failed')
      );

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Deepgram health check failed',
        expect.any(Error)
      );
    });
  });

  describe('Error handling', () => {
    test('ネットワークエラーをリトライ可能エラーとして分類すること', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockClient.listen.prerecorded.transcribeFile.mockRejectedValue(networkError);

      try {
        await adapter.transcribe(Buffer.from('audio'));
      } catch (error) {
        expect(error).toBeInstanceOf(STTError);
        expect((error as STTError).isRetryable).toBe(true);
      }
    });

    test('認証エラーをリトライ不可能エラーとして分類すること', async () => {
      const authError = new Error('Invalid API key');
      mockClient.listen.prerecorded.transcribeFile.mockRejectedValue(authError);

      try {
        await adapter.transcribe(Buffer.from('audio'));
      } catch (error) {
        expect(error).toBeInstanceOf(STTError);
        expect((error as STTError).isRetryable).toBe(false);
      }
    });
  });
});
