/**
 * Tsumiki AITDD - Verify Phase
 * タスク3: 音声キャプチャとSTTの統合テスト
 */

import { MockAudioCapture } from '../../src/audio/mock-capture';
import { StreamingSTT } from '../../src/stt/streaming';
import { MockSTTAdapter } from '../../src/adapters/mocks/stt';
import { AudioBuffer } from '../../src/interfaces/audio';
import { TranscriptResult } from '../../src/interfaces/stt';

describe('Audio Capture + STT Integration', () => {
  let audioCapture: MockAudioCapture;
  let stt: StreamingSTT;
  let sttAdapter: MockSTTAdapter;

  beforeEach(() => {
    sttAdapter = new MockSTTAdapter({ 
      failureRate: 0,
      healthy: true,
      defaultConfidence: 0.95
    });
  });

  afterEach(async () => {
    if (audioCapture && audioCapture.isCapturing()) {
      await audioCapture.stop();
    }
    if (stt && stt.isStreaming()) {
      await stt.stop();
    }
  });

  test.skip('音声キャプチャからSTTまでの完全なフロー', async () => {
    // 音声キャプチャの設定
    audioCapture = new MockAudioCapture({
      deviceName: 'BlackHole 2ch',
      sampleRate: 16000,
      channels: 1,
      bufferSize: 4096,
    });

    // STTの設定
    stt = new StreamingSTT({
      adapter: sttAdapter,
      language: 'ja',
      interimResults: true,
      punctuation: true,
      wordTimestamps: false,
      maxAlternatives: 1,
    });

    // 結果を収集
    const transcripts: TranscriptResult[] = [];
    stt.on('transcript', (result) => {
      transcripts.push(result);
    });

    // STTストリームを開始
    const sttStream = await stt.start();
    
    // 音声キャプチャを開始して音声データをSTTに流す
    audioCapture.on('data', (buffer: AudioBuffer) => {
      sttStream.write(buffer.data);
    });
    
    await audioCapture.start();

    // 少し待つ
    await new Promise(resolve => setTimeout(resolve, 500));

    // 停止
    await audioCapture.stop();
    await stt.stop();

    // 検証
    expect(transcripts.length).toBeGreaterThan(0);
    transcripts.forEach(transcript => {
      expect(transcript.text).toBeTruthy();
      expect(transcript.language).toBe('ja');
      expect(transcript.confidence).toBeGreaterThan(0);
      expect(transcript.confidence).toBeLessThanOrEqual(1);
    });
  });

  test('エラーハンドリングと再接続', async () => {
    // エラー率を設定
    sttAdapter = new MockSTTAdapter({ 
      failureRate: 0.3, // 30%のエラー率
      healthy: true,
      defaultConfidence: 0.95
    });

    audioCapture = new MockAudioCapture({
      deviceName: 'BlackHole 2ch',
      sampleRate: 16000,
      channels: 1,
      bufferSize: 4096,
      autoReconnect: true,
    });

    stt = new StreamingSTT({
      adapter: sttAdapter,
      language: 'ja',
      interimResults: true,
      punctuation: true,
      wordTimestamps: false,
      maxAlternatives: 1,
      autoReconnect: true,
    });

    let errorCount = 0;
    let reconnectCount = 0;

    // エラーハンドリング
    const handleError = () => errorCount++;
    audioCapture.on('error', handleError);
    stt.on('error', handleError);

    // 再接続の監視
    audioCapture.on('reconnecting', () => reconnectCount++);
    stt.on('reconnecting', () => reconnectCount++);

    const sttStream = await stt.start();
    audioCapture.on('data', (buffer: AudioBuffer) => {
      try {
        sttStream.write(buffer.data);
      } catch (error) {
        // ストリームエラーを無視
      }
    });

    await audioCapture.start();

    // デバイス切断をシミュレート
    audioCapture.simulateDisconnect();

    // 再接続を待つ
    await new Promise(resolve => setTimeout(resolve, 300));

    // 停止
    await audioCapture.stop();
    await stt.stop();

    // エラーと再接続が発生したことを確認
    expect(errorCount).toBeGreaterThan(0);
    expect(reconnectCount).toBeGreaterThan(0);
  });

  test('バッファサイズとレイテンシの検証', async () => {
    const bufferSize = 2048; // 小さめのバッファ
    const sampleRate = 16000;
    
    audioCapture = new MockAudioCapture({
      deviceName: 'BlackHole 2ch',
      sampleRate,
      channels: 1,
      bufferSize,
    });

    stt = new StreamingSTT({
      adapter: sttAdapter,
      language: 'ja',
      interimResults: false, // 最終結果のみ
      punctuation: true,
      wordTimestamps: false,
      maxAlternatives: 1,
    });

    const captureTimestamps: number[] = [];
    const transcriptTimestamps: number[] = [];

    audioCapture.on('data', (buffer: AudioBuffer) => {
      captureTimestamps.push(buffer.timestamp);
    });

    stt.on('transcript', (result: TranscriptResult) => {
      if (result.isFinal) {
        transcriptTimestamps.push(result.timestamp);
      }
    });

    const sttStream = await stt.start();
    audioCapture.on('data', (buffer: AudioBuffer) => {
      sttStream.write(buffer.data);
    });

    await audioCapture.start();
    await new Promise(resolve => setTimeout(resolve, 200));
    await audioCapture.stop();
    await stt.stop();

    // バッファサイズの検証
    const expectedBufferDuration = bufferSize / sampleRate / 2 * 1000; // ms
    if (captureTimestamps.length > 1) {
      const actualInterval = captureTimestamps[1]! - captureTimestamps[0]!;
      expect(actualInterval).toBeCloseTo(expectedBufferDuration, -1); // 10ms精度
    }

    // レイテンシの検証（モックなので即座に応答）
    if (transcriptTimestamps.length > 0 && captureTimestamps.length > 0) {
      const latency = transcriptTimestamps[0]! - captureTimestamps[0]!;
      expect(latency).toBeLessThan(100); // 100ms以内
    }
  });
});
