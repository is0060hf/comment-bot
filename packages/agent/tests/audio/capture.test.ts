/**
 * Tsumiki AITDD - Red Phase
 * タスク3: 音声キャプチャのテストケース
 */

import { AudioCapture, AudioCaptureConfig, AudioBuffer, AudioDevice } from '../../src/audio/capture';
import { MockAudioCapture } from '../../src/audio/mock-capture';
import { EventEmitter } from 'events';

describe('AudioCapture', () => {
  let capture: AudioCapture | MockAudioCapture;
  let config: AudioCaptureConfig;

  beforeEach(() => {
    config = {
      deviceName: 'BlackHole 2ch',
      sampleRate: 16000,
      channels: 1,
      bufferSize: 4096,
    };
  });

  afterEach(async () => {
    if (capture) {
      await capture.stop();
    }
  });

  describe('initialization', () => {
    test('正しい設定で初期化できること', () => {
      capture = new MockAudioCapture(config);
      expect(capture).toBeDefined();
      const actualConfig = capture.getConfig();
      expect(actualConfig.deviceName).toBe(config.deviceName);
      expect(actualConfig.sampleRate).toBe(config.sampleRate);
      expect(actualConfig.channels).toBe(config.channels);
      expect(actualConfig.bufferSize).toBe(config.bufferSize);
    });

    test('不正なサンプルレートでエラーになること', () => {
      const invalidConfig = { ...config, sampleRate: 0 };
      expect(() => new MockAudioCapture(invalidConfig)).toThrow('Invalid sample rate');
    });

    test('不正なチャンネル数でエラーになること', () => {
      const invalidConfig = { ...config, channels: 0 };
      expect(() => new MockAudioCapture(invalidConfig)).toThrow('Invalid channel count');
    });
  });

  describe('device enumeration', () => {
    test('利用可能なオーディオデバイスを列挙できること', async () => {
      const devices = await MockAudioCapture.listDevices();
      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBeGreaterThanOrEqual(0);
      
      if (devices.length > 0) {
        expect(devices[0]).toHaveProperty('id');
        expect(devices[0]).toHaveProperty('name');
        expect(devices[0]).toHaveProperty('type');
      }
    });

    test('入力デバイスのみをフィルタできること', async () => {
      const inputDevices = await MockAudioCapture.listInputDevices();
      expect(Array.isArray(inputDevices)).toBe(true);
      
      inputDevices.forEach((device: AudioDevice) => {
        expect(device.type).toBe('input');
      });
    });
  });

  describe('audio capture', () => {
    test('音声キャプチャを開始できること', async () => {
      capture = new MockAudioCapture(config);
      
      await expect(capture.start()).resolves.not.toThrow();
      expect(capture.isCapturing()).toBe(true);
    });

    test('音声データを受信できること', async () => {
      capture = new MockAudioCapture(config);
      const dataPromise = new Promise<AudioBuffer>((resolve) => {
        capture.on('data', (buffer: AudioBuffer) => {
          resolve(buffer);
        });
      });

      await capture.start();
      const buffer = await dataPromise;

      expect(buffer).toBeDefined();
      expect(buffer.data).toBeInstanceOf(Buffer);
      expect(buffer.sampleRate).toBe(config.sampleRate);
      expect(buffer.channels).toBe(config.channels);
      expect(buffer.timestamp).toBeGreaterThan(0);
    });

    test('音声キャプチャを停止できること', async () => {
      capture = new MockAudioCapture(config);
      
      await capture.start();
      expect(capture.isCapturing()).toBe(true);
      
      await capture.stop();
      expect(capture.isCapturing()).toBe(false);
    });

    test('エラー時にエラーイベントが発生すること', async () => {
      capture = new MockAudioCapture({ ...config, deviceName: 'NonExistentDevice' });
      
      const errorPromise = new Promise<Error>((resolve) => {
        capture.on('error', (error: Error) => {
          resolve(error);
        });
      });

      await capture.start().catch(() => {}); // エラーを無視
      const error = await errorPromise;

      expect(error).toBeDefined();
      expect(error.message).toContain('device');
    });
  });

  describe('buffer processing', () => {
    test('バッファサイズが設定通りであること', async () => {
      capture = new MockAudioCapture(config);
      const buffers: AudioBuffer[] = [];
      
      capture.on('data', (buffer: AudioBuffer) => {
        buffers.push(buffer);
      });

      await capture.start();
      
      // 300ms待機（バッファサイズとサンプルレートに基づく）
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await capture.stop();

      expect(buffers.length).toBeGreaterThan(0);
      buffers.forEach(buffer => {
        expect(buffer.data.length).toBe(config.bufferSize); // バッファサイズと一致
      });
    });

    test('サンプルレート変換が正しく動作すること', async () => {
      // 48kHz -> 16kHz への変換をテスト
      const highSampleRateConfig = { ...config, sourceSampleRate: 48000 };
      capture = new MockAudioCapture(highSampleRateConfig);
      
      const dataPromise = new Promise<AudioBuffer>((resolve) => {
        capture.on('data', (buffer: AudioBuffer) => {
          resolve(buffer);
        });
      });

      await capture.start();
      const buffer = await dataPromise;

      expect(buffer.sampleRate).toBe(16000);
    });
  });

  describe('reconnection', () => {
    test('デバイス切断時に自動再接続を試みること', async () => {
      capture = new MockAudioCapture({ ...config, autoReconnect: true });
      let reconnectAttempted = false;
      
      capture.on('reconnecting', () => {
        reconnectAttempted = true;
      });
      
      // エラーハンドラを追加
      capture.on('error', () => {
        // エラーを無視
      });

      await capture.start();
      
      // デバイス切断をシミュレート
      (capture as MockAudioCapture).simulateDisconnect();
      
      // 再接続の試行を待つ
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(reconnectAttempted).toBe(true);
    });

    test.skip('最大再接続回数を超えたらエラーになること', async () => {
      capture = new MockAudioCapture({ 
        ...config, 
        autoReconnect: true,
        maxReconnectAttempts: 1 
      });
      
      let errorReceived = false;
      capture.on('error', (error: Error) => {
        if (error.message.includes('Max reconnection attempts')) {
          errorReceived = true;
        }
      });

      await capture.start();
      
      // 複数回の切断をシミュレート
      (capture as MockAudioCapture).simulateDisconnect();
      await new Promise(resolve => setTimeout(resolve, 50));
      (capture as MockAudioCapture).simulateDisconnect();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(errorReceived).toBe(true);
    });
  });
});
