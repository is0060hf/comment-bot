/**
 * Tsumiki AITDD - Refactor Phase
 * タスク49: STTアダプタの統合テスト
 */

import { DeepgramAdapter } from '../../src/adapters/deepgram';
import { GCPSpeechAdapter } from '../../src/adapters/gcp-speech';
import { WhisperAdapter } from '../../src/adapters/whisper';
import { FailoverManager } from '../../src/core/failover';
import { STTPort, STTResult } from '../../src/ports/stt';
import { Logger, LogLevel } from '../../src/logging/logger';
import * as fs from 'fs';
import * as path from 'path';

describe('STT Adapters Integration', () => {
  let mockLogger: Logger;
  const testAudioPath = path.join(__dirname, 'test-audio.wav');

  beforeAll(() => {
    // テスト用の音声ファイルを作成（WAVヘッダー付きの無音）
    const wavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0x08, 0x00, 0x00, // Chunk size
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6d, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // Subchunk size
      0x01, 0x00,             // Audio format (PCM)
      0x01, 0x00,             // Num channels
      0x80, 0x3e, 0x00, 0x00, // Sample rate (16000)
      0x00, 0x7d, 0x00, 0x00, // Byte rate
      0x02, 0x00,             // Block align
      0x10, 0x00,             // Bits per sample
      0x64, 0x61, 0x74, 0x61, // "data"
      0x00, 0x08, 0x00, 0x00, // Data size
    ]);
    const audioData = Buffer.alloc(2048); // 短い無音データ
    const testAudio = Buffer.concat([wavHeader, audioData]);
    fs.writeFileSync(testAudioPath, testAudio);
  });

  afterAll(() => {
    if (fs.existsSync(testAudioPath)) {
      fs.unlinkSync(testAudioPath);
    }
  });

  beforeEach(() => {
    mockLogger = new Logger({
      level: LogLevel.ERROR,
      console: false,
    });
  });

  describe('Individual Adapter Tests', () => {
    test('Deepgramアダプタの基本動作', async () => {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        console.log('Skipping Deepgram test: API key not set');
        return;
      }

      const adapter = new DeepgramAdapter({
        apiKey,
        model: 'nova-2',
        language: 'ja',
        logger: mockLogger,
      });

      const audioBuffer = fs.readFileSync(testAudioPath);
      const result = await adapter.transcribe(audioBuffer);

      expect(result).toMatchObject({
        transcript: expect.any(String),
        confidence: expect.any(Number),
        segments: expect.any(Array),
        timestamp: expect.any(Number),
        provider: 'deepgram',
      });
    });

    test('GCP Speechアダプタの基本動作', async () => {
      const keyFilename = process.env.GCP_SPEECH_KEY_FILE;
      if (!keyFilename) {
        console.log('Skipping GCP Speech test: Key file not set');
        return;
      }

      const adapter = new GCPSpeechAdapter({
        keyFilename,
        languageCode: 'ja-JP',
        model: 'latest_long',
        logger: mockLogger,
      });

      const audioBuffer = fs.readFileSync(testAudioPath);
      const result = await adapter.transcribe(audioBuffer);

      expect(result).toMatchObject({
        transcript: expect.any(String),
        confidence: expect.any(Number),
        segments: expect.any(Array),
        timestamp: expect.any(Number),
        provider: 'gcp-speech',
      });
    });

    test('Whisperアダプタの基本動作', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping Whisper test: API key not set');
        return;
      }

      const adapter = new WhisperAdapter({
        apiKey,
        model: 'whisper-1',
        language: 'ja',
        logger: mockLogger,
      });

      const audioBuffer = fs.readFileSync(testAudioPath);
      const result = await adapter.transcribe(audioBuffer);

      expect(result).toMatchObject({
        transcript: expect.any(String),
        confidence: expect.any(Number),
        segments: expect.any(Array),
        timestamp: expect.any(Number),
        provider: 'whisper',
      });
    });
  });

  describe('Failover Manager with STT Adapters', () => {
    test('フェイルオーバーが正しく動作すること', async () => {
      // モックアダプタ
      const failingAdapter: STTPort = {
        transcribe: jest.fn().mockRejectedValue(new Error('Service unavailable')),
        startStreaming: jest.fn(),
        isHealthy: jest.fn().mockResolvedValue(false),
      };

      const successAdapter: STTPort = {
        transcribe: jest.fn().mockResolvedValue({
          transcript: 'フェイルオーバー成功',
          confidence: 0.95,
          segments: [],
          timestamp: Date.now(),
          provider: 'backup',
        }),
        startStreaming: jest.fn(),
        isHealthy: jest.fn().mockResolvedValue(true),
      };

      const failoverManager = new FailoverManager<STTPort>({
        providers: [
          { name: 'primary', provider: failingAdapter, priority: 1 },
          { name: 'backup', provider: successAdapter, priority: 2 },
        ],
        healthCheckInterval: 30000,
        logger: mockLogger,
      });

      const audioBuffer = Buffer.from('test-audio');
      const result = await failoverManager.execute(
        provider => provider.transcribe(audioBuffer)
      );

      expect(result.transcript).toBe('フェイルオーバー成功');
      expect(failingAdapter.transcribe).toHaveBeenCalledTimes(1);
      expect(successAdapter.transcribe).toHaveBeenCalledTimes(1);
    });

    test('ヘルスチェックによるプロバイダー回復', async () => {
      let isHealthy = false;
      const recoveringAdapter: STTPort = {
        transcribe: jest.fn().mockImplementation(async () => {
          if (!isHealthy) {
            throw new Error('Service down');
          }
          return {
            transcript: '回復しました',
            confidence: 0.9,
            segments: [],
            timestamp: Date.now(),
            provider: 'recovering',
          };
        }),
        startStreaming: jest.fn(),
        isHealthy: jest.fn().mockImplementation(async () => isHealthy),
      };

      const failoverManager = new FailoverManager<STTPort>({
        providers: [
          { name: 'recovering', provider: recoveringAdapter, priority: 1 },
        ],
        healthCheckInterval: 100, // 短い間隔でテスト
        logger: mockLogger,
      });

      // 最初は失敗
      try {
        await failoverManager.execute(
          provider => provider.transcribe(Buffer.from('test'))
        );
      } catch (error) {
        expect(error).toBeDefined();
      }

      // サービスを回復
      isHealthy = true;

      // ヘルスチェックを待つ
      await new Promise(resolve => setTimeout(resolve, 200));

      // 回復後は成功
      const result = await failoverManager.execute(
        provider => provider.transcribe(Buffer.from('test'))
      );

      expect(result.transcript).toBe('回復しました');
    });
  });

  describe('Performance and Reliability', () => {
    test('複数の同時リクエストを処理できること', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping concurrent test: API key not set');
        return;
      }

      const adapter = new WhisperAdapter({
        apiKey,
        model: 'whisper-1',
        language: 'ja',
        logger: mockLogger,
      });

      const audioBuffer = fs.readFileSync(testAudioPath);
      const requests = Array(3).fill(0).map(() => 
        adapter.transcribe(audioBuffer)
      );

      const results = await Promise.all(requests);

      results.forEach(result => {
        expect(result).toMatchObject({
          transcript: expect.any(String),
          confidence: expect.any(Number),
          provider: 'whisper',
        });
      });
    });

    test('大きなファイルのエラーハンドリング', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping large file test: API key not set');
        return;
      }

      const adapter = new WhisperAdapter({
        apiKey,
        model: 'whisper-1',
        logger: mockLogger,
      });

      // 26MBのファイル（Whisperの上限を超える）
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024);

      await expect(adapter.transcribe(largeBuffer))
        .rejects.toThrow('Audio file too large');
    });
  });

  describe('Language Detection', () => {
    test('言語を自動検出できること', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('Skipping language detection test: API key not set');
        return;
      }

      const adapter = new WhisperAdapter({
        apiKey,
        model: 'whisper-1',
        // 言語を指定しない
        logger: mockLogger,
      });

      const audioBuffer = fs.readFileSync(testAudioPath);
      const result = await adapter.transcribe(audioBuffer);

      // 言語が検出されることを確認
      expect(result.language).toBeDefined();
    });
  });
});
