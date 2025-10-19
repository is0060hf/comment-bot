/**
 * Tsumiki AITDD - Red Phase
 * タスク49: GCP Speech-to-Textアダプタのテストケース
 */

import { GCPSpeechAdapter } from '../../src/adapters/gcp-speech';
import { STTPort, STTResult, STTError } from '../../src/ports/stt';
import { SpeechClient } from '@google-cloud/speech';
import { EventEmitter, Transform } from 'stream';

// GCP Speech SDKのモック
jest.mock('@google-cloud/speech');

describe('GCPSpeechAdapter', () => {
  let adapter: GCPSpeechAdapter;
  let mockClient: any;
  let mockStream: any;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // モックストリーム（EventEmitter）
    mockStream = new EventEmitter();
    mockStream.write = jest.fn();
    mockStream.end = jest.fn();
    mockStream.destroy = jest.fn();

    // モッククライアント
    mockClient = {
      recognize: jest.fn(),
      streamingRecognize: jest.fn().mockReturnValue(mockStream),
    };

    // SpeechClientコンストラクタのモック
    (SpeechClient as jest.MockedClass<typeof SpeechClient>).mockImplementation(() => mockClient);

    adapter = new GCPSpeechAdapter({
      projectId: 'test-project',
      keyFilename: '/path/to/key.json',
      languageCode: 'ja-JP',
      model: 'latest_long',
      logger: mockLogger,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('認証情報で初期化できること', () => {
      expect(SpeechClient).toHaveBeenCalledWith({
        projectId: 'test-project',
        keyFilename: '/path/to/key.json',
      });
    });

    test('デフォルト設定が適用されること', () => {
      const defaultAdapter = new GCPSpeechAdapter({
        projectId: 'test-project',
      });

      expect(defaultAdapter).toBeDefined();
    });
  });

  describe('transcribe', () => {
    test('音声バッファを文字起こしできること', async () => {
      const audioBuffer = Buffer.from('fake-audio-data');
      const mockResponse = [{
        results: [{
          alternatives: [{
            transcript: 'Google Cloud Speech APIのテスト',
            confidence: 0.98,
            words: [
              { word: 'Google', startTime: { seconds: 0, nanos: 0 }, endTime: { seconds: 0, nanos: 500000000 }, confidence: 0.98 },
              { word: 'Cloud', startTime: { seconds: 0, nanos: 600000000 }, endTime: { seconds: 1, nanos: 0 }, confidence: 0.98 },
              { word: 'Speech', startTime: { seconds: 1, nanos: 100000000 }, endTime: { seconds: 1, nanos: 500000000 }, confidence: 0.98 },
              { word: 'API', startTime: { seconds: 1, nanos: 600000000 }, endTime: { seconds: 1, nanos: 900000000 }, confidence: 0.98 },
              { word: 'の', startTime: { seconds: 2, nanos: 0 }, endTime: { seconds: 2, nanos: 100000000 }, confidence: 0.98 },
              { word: 'テスト', startTime: { seconds: 2, nanos: 200000000 }, endTime: { seconds: 2, nanos: 600000000 }, confidence: 0.98 },
            ],
          }],
        }],
      }];

      mockClient.recognize.mockResolvedValue(mockResponse);

      const result = await adapter.transcribe(audioBuffer);

      expect(result).toEqual<STTResult>({
        transcript: 'Google Cloud Speech APIのテスト',
        confidence: 0.98,
        segments: [{
          text: 'Google Cloud Speech APIのテスト',
          startTime: 0,
          endTime: 2.6,
          confidence: 0.98,
        }],
        timestamp: expect.any(Number),
        provider: 'gcp-speech',
      });

      expect(mockClient.recognize).toHaveBeenCalledWith({
        audio: { content: audioBuffer.toString('base64') },
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 16000,
          languageCode: 'ja-JP',
          model: 'latest_long',
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
          enableAutomaticPunctuation: true,
        },
      });
    });

    test('複数の結果を結合できること', async () => {
      const audioBuffer = Buffer.from('multi-sentence-audio');
      const mockResponse = [{
        results: [
          {
            alternatives: [{
              transcript: '最初の文です。',
              confidence: 0.95,
            }],
          },
          {
            alternatives: [{
              transcript: '次の文です。',
              confidence: 0.93,
            }],
          },
        ],
      }];

      mockClient.recognize.mockResolvedValue(mockResponse);

      const result = await adapter.transcribe(audioBuffer);

      expect(result.transcript).toBe('最初の文です。次の文です。');
      expect(result.confidence).toBeCloseTo(0.94, 2); // 平均
    });

    test('空の結果を処理できること', async () => {
      const audioBuffer = Buffer.from('silence');
      const mockResponse = [{
        results: [],
      }];

      mockClient.recognize.mockResolvedValue(mockResponse);

      const result = await adapter.transcribe(audioBuffer);

      expect(result.transcript).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.segments).toEqual([]);
    });

    test('APIエラーをハンドリングできること', async () => {
      const audioBuffer = Buffer.from('audio');
      const apiError = new Error('Quota exceeded');
      
      mockClient.recognize.mockRejectedValue(apiError);

      await expect(adapter.transcribe(audioBuffer))
        .rejects.toThrow('GCP Speech transcription failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'GCP Speech transcription error',
        apiError
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
      expect(mockClient.streamingRecognize).toHaveBeenCalled();

      // 設定要求が送信されることを確認
      expect(mockStream.write).toHaveBeenCalledWith({
        streamingConfig: {
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 16000,
            languageCode: 'ja-JP',
            model: 'latest_long',
            enableWordTimeOffsets: true,
            enableWordConfidence: true,
            enableAutomaticPunctuation: true,
          },
          interimResults: true,
        },
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

      // GCPからの結果をシミュレート
      const mockResult = {
        results: [{
          alternatives: [{
            transcript: 'リアルタイム文字起こし',
            confidence: 0.96,
            words: [
              {
                word: 'リアルタイム',
                startTime: { seconds: 0, nanos: 0 },
                endTime: { seconds: 0, nanos: 800000000 },
                confidence: 0.96,
              },
              {
                word: '文字起こし',
                startTime: { seconds: 0, nanos: 900000000 },
                endTime: { seconds: 1, nanos: 500000000 },
                confidence: 0.96,
              },
            ],
          }],
          isFinal: true,
        }],
      };

      mockStream.emit('data', mockResult);

      await new Promise(resolve => setImmediate(resolve));

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        transcript: 'リアルタイム文字起こし',
        confidence: 0.96,
        isFinal: true,
        provider: 'gcp-speech',
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
        results: [{
          alternatives: [{
            transcript: '話している途中',
            confidence: 0.85,
          }],
          isFinal: false,
        }],
      };

      mockStream.emit('data', interimResult);

      await new Promise(resolve => setImmediate(resolve));

      expect(results).toHaveLength(1);
      expect(results[0]!.isFinal).toBe(false);
    });

    test('エラーをハンドリングできること', async () => {
      const transform = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });

      const errorSpy = jest.fn();
      transform.on('error', errorSpy);

      await adapter.startStreaming(transform);

      const streamError = new Error('Stream interrupted');
      mockStream.emit('error', streamError);

      // 再接続の試行を待つ
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(errorSpy).not.toHaveBeenCalled(); // 再接続を試行するため、エラーはまだ発生しない
      expect(mockLogger.error).toHaveBeenCalledWith(
        'GCP Speech streaming error',
        streamError
      );
    });

    test('音声データを送信できること', async () => {
      const transform = new Transform({
        transform(chunk, _encoding, callback) {
          // 音声データをGCPに送信
          mockStream.write({ audioContent: chunk });
          callback();
        },
      });

      await adapter.startStreaming(transform);

      const audioChunk = Buffer.from('audio-chunk');
      transform.write(audioChunk);

      expect(mockStream.write).toHaveBeenCalledWith({
        audioContent: audioChunk,
      });
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

      expect(mockStream.end).toHaveBeenCalled();
    });

    test('再接続をサポートすること', async () => {
      const transform = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });

      const reconnectedSpy = jest.fn();
      transform.on('reconnected', reconnectedSpy);

      await adapter.startStreaming(transform);

      // 接続エラー
      const error = new Error('Connection lost');
      mockStream.emit('error', error);

      // 再接続のシミュレートを待つ
      await new Promise(resolve => setTimeout(resolve, 1100));

      // 再接続イベントが発火されることを確認
      expect(reconnectedSpy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retrying GCP Speech streaming')
      );
    });
  });

  describe('isHealthy', () => {
    test('正常な状態を報告できること', async () => {
      // ヘルスチェック用のモックレスポンス
      mockClient.recognize.mockResolvedValue([{
        results: [{ alternatives: [{ transcript: '' }] }],
      }]);

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(true);
    });

    test('APIエラー時は異常と報告すること', async () => {
      mockClient.recognize.mockRejectedValue(
        new Error('Invalid credentials')
      );

      const isHealthy = await adapter.isHealthy();

      expect(isHealthy).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'GCP Speech health check failed',
        expect.any(Error)
      );
    });
  });

  describe('Error handling', () => {
    test('ネットワークエラーをリトライ可能エラーとして分類すること', async () => {
      const networkError: any = new Error('DEADLINE_EXCEEDED');
      networkError.code = 4; // gRPC DEADLINE_EXCEEDED
      mockClient.recognize.mockRejectedValue(networkError);

      try {
        await adapter.transcribe(Buffer.from('audio'));
      } catch (error) {
        expect(error).toBeInstanceOf(STTError);
        expect((error as STTError).isRetryable).toBe(true);
      }
    });

    test('認証エラーをリトライ不可能エラーとして分類すること', async () => {
      const authError: any = new Error('UNAUTHENTICATED');
      authError.code = 16; // gRPC UNAUTHENTICATED
      mockClient.recognize.mockRejectedValue(authError);

      try {
        await adapter.transcribe(Buffer.from('audio'));
      } catch (error) {
        expect(error).toBeInstanceOf(STTError);
        expect((error as STTError).isRetryable).toBe(false);
      }
    });
  });
});
