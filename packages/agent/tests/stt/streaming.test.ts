/**
 * Tsumiki AITDD - Red Phase
 * タスク3: STTストリーミングのテストケース
 */

import { StreamingSTT, STTConfig, TranscriptResult } from '../../src/stt/streaming';
import { STTPort } from '../../src/ports/stt';
import { Readable, Writable, Duplex } from 'stream';

describe('StreamingSTT', () => {
  let stt: StreamingSTT;
  let mockAdapter: jest.Mocked<STTPort>;
  let config: STTConfig;

  beforeEach(() => {
    mockAdapter = {
      transcribe: jest.fn(),
      startStreaming: jest.fn(),
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    config = {
      adapter: mockAdapter,
      language: 'ja',
      interimResults: true,
      punctuation: true,
      wordTimestamps: false,
      maxAlternatives: 1,
    };
  });

  afterEach(async () => {
    if (stt && stt.isStreaming()) {
      await stt.stop();
    }
  });

  describe('initialization', () => {
    test('正しい設定で初期化できること', () => {
      stt = new StreamingSTT(config);
      expect(stt).toBeDefined();
      const actualConfig = stt.getConfig();
      expect(actualConfig.adapter).toBe(config.adapter);
      expect(actualConfig.language).toBe(config.language);
      expect(actualConfig.interimResults).toBe(config.interimResults);
      expect(actualConfig.punctuation).toBe(config.punctuation);
      expect(actualConfig.wordTimestamps).toBe(config.wordTimestamps);
      expect(actualConfig.maxAlternatives).toBe(config.maxAlternatives);
    });

    test('アダプタなしでエラーになること', () => {
      const invalidConfig = { ...config, adapter: null as any };
      expect(() => new StreamingSTT(invalidConfig)).toThrow('STT adapter is required');
    });
  });

  describe('streaming', () => {
    test('ストリーミングを開始できること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT(config);
      const stream = await stt.start();

      expect(stream).toBeDefined();
      expect(mockAdapter.startStreaming).toHaveBeenCalled();
      expect(stt.isStreaming()).toBe(true);
    });

    test('音声データを送信できること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT(config);
      const stream = await stt.start();

      const audioData = Buffer.from([1, 2, 3, 4]);
      const writeResult = stream.write(audioData);

      expect(writeResult).toBe(true);
      expect(mockStream.receivedData).toContainEqual(audioData);
    });

    test('暫定結果を受信できること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT(config);
      const resultPromise = new Promise<TranscriptResult>((resolve) => {
        stt.on('transcript', (result: TranscriptResult) => {
          resolve(result);
        });
      });

      const stream = await stt.start();
      
      // 暫定結果をシミュレート
      const interimResult: TranscriptResult = {
        text: 'こんにちは',
        isFinal: false,
        confidence: 0.8,
        timestamp: Date.now(),
        language: 'ja',
        alternatives: [],
      };
      
      mockStream.emit('data', interimResult);
      
      const result = await resultPromise;
      expect(result.text).toBe('こんにちは');
      expect(result.isFinal).toBe(false);
    });

    test('最終結果を受信できること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT(config);
      const results: TranscriptResult[] = [];
      
      stt.on('transcript', (result: TranscriptResult) => {
        results.push(result);
      });

      await stt.start();
      
      // 暫定結果と最終結果をシミュレート
      mockStream.emit('data', {
        text: 'こんにちは',
        isFinal: false,
        confidence: 0.8,
        timestamp: Date.now(),
        language: 'ja',
        alternatives: [],
      });
      
      mockStream.emit('data', {
        text: 'こんにちは、元気ですか？',
        isFinal: true,
        confidence: 0.95,
        timestamp: Date.now(),
        language: 'ja',
        alternatives: [],
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(results).toHaveLength(2);
      expect(results[0]?.isFinal).toBe(false);
      expect(results[1]?.isFinal).toBe(true);
      expect(results[1]?.text).toBe('こんにちは、元気ですか？');
    });

    test('ストリーミングを停止できること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT(config);
      await stt.start();
      
      expect(stt.isStreaming()).toBe(true);
      
      await stt.stop();
      
      expect(stt.isStreaming()).toBe(false);
      expect(mockStream.destroyed).toBe(true);
    });
  });

  describe('error handling', () => {
    test('ストリームエラーを処理できること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT(config);
      const errorPromise = new Promise<Error>((resolve) => {
        stt.on('error', (error: Error) => {
          resolve(error);
        });
      });

      await stt.start();
      
      const testError = new Error('Stream error');
      mockStream.emit('error', testError);
      
      const error = await errorPromise;
      expect(error.message).toBe('Stream error');
    });

    test('再接続可能なエラーで自動再接続すること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT({ ...config, autoReconnect: true });
      let reconnectCount = 0;
      
      stt.on('reconnecting', () => {
        reconnectCount++;
      });
      
      // エラーハンドラを追加
      stt.on('error', () => {
        // エラーを無視
      });

      await stt.start();
      
      // 再接続可能なエラーをシミュレート
      mockStream.emit('error', { code: 'ECONNRESET', retryable: true });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(reconnectCount).toBeGreaterThan(0);
    });

    test('最大再接続回数を超えたらエラーになること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT({ 
        ...config, 
        autoReconnect: true,
        maxReconnectAttempts: 2 
      });
      
      let finalError: Error | null = null;
      stt.on('error', (error: any) => {
        if (error && error.message && error.message.includes('Max reconnection attempts')) {
          finalError = error;
        }
      });

      await stt.start();
      
      // 複数回のエラーをシミュレート
      for (let i = 0; i < 3; i++) {
        mockStream.emit('error', { code: 'ECONNRESET', retryable: true });
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      expect(finalError).not.toBeNull();
    });
  });

  describe('language detection', () => {
    test('言語を自動検出できること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT({ ...config, language: 'auto' });
      
      const resultPromise = new Promise<TranscriptResult>((resolve) => {
        stt.on('transcript', (result: TranscriptResult) => {
          resolve(result);
        });
      });

      await stt.start();
      
      mockStream.emit('data', {
        text: 'Hello, how are you?',
        isFinal: true,
        confidence: 0.95,
        timestamp: Date.now(),
        language: 'en',
        alternatives: [],
      });
      
      const result = await resultPromise;
      expect(result.language).toBe('en');
    });
  });

  describe('alternatives', () => {
    test('複数の認識候補を取得できること', async () => {
      const mockStream = new MockDuplexStream();
      mockAdapter.startStreaming.mockReturnValue(mockStream);

      stt = new StreamingSTT({ ...config, maxAlternatives: 3 });
      
      const resultPromise = new Promise<TranscriptResult>((resolve) => {
        stt.on('transcript', (result: TranscriptResult) => {
          if (result.isFinal) {
            resolve(result);
          }
        });
      });

      await stt.start();
      
      mockStream.emit('data', {
        text: 'こんにちは',
        isFinal: true,
        confidence: 0.95,
        timestamp: Date.now(),
        language: 'ja',
        alternatives: [
          { text: 'こんにちわ', confidence: 0.85 },
          { text: '今日は', confidence: 0.70 },
        ],
      });
      
      const result = await resultPromise;
      expect(result.alternatives).toHaveLength(2);
      expect(result.alternatives[0]?.text).toBe('こんにちわ');
    });
  });
});

// Mock Duplex Stream for testing
class MockDuplexStream extends Duplex {
  receivedData: Buffer[] = [];
  destroyed = false;

  constructor() {
    super({ objectMode: true });
  }

  _read() {
    // No-op
  }

  _write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
    this.receivedData.push(chunk);
    callback();
  }

  destroy() {
    this.destroyed = true;
    this.emit('close');
    return this;
  }
}
