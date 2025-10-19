/**
 * 音声キャプチャのテスト
 * BlackHole/Loopbackからの音声取得機能をテスト
 */

import { AudioCapture } from '../../src/audio/capture';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';

// モックの型定義
jest.mock('child_process');
jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: (fn: Function) => {
    return (...args: any[]) => {
      return new Promise((resolve, reject) => {
        fn(...args, (err: any, stdout: any, stderr: any) => {
          if (err) {
            reject(err);
          } else {
            resolve({ stdout, stderr });
          }
        });
      });
    };
  }
}));

describe('AudioCapture', () => {
  let audioCapture: AudioCapture;
  let mockFFmpeg: jest.Mocked<ChildProcess>;

  beforeEach(() => {
    // child_processモジュールのモックをリセット
    jest.clearAllMocks();
    
    // FFmpegプロセスのモック
    mockFFmpeg = new EventEmitter() as any;
    mockFFmpeg.kill = jest.fn();
    mockFFmpeg.stdout = new EventEmitter() as any;
    mockFFmpeg.stderr = new EventEmitter() as any;
    mockFFmpeg.stdin = { write: jest.fn(), end: jest.fn() } as any;
    
    // spawn関数のモック
    const { spawn } = require('child_process');
    spawn.mockReturnValue(mockFFmpeg);

    // exec関数のモック（promisifiedバージョン用）
    const { exec } = require('child_process');
    const mockExec = jest.fn((cmd: string, options: any, callback?: Function) => {
      // promisifyされた場合の対応
      const cb = callback || options;
      if (typeof cb === 'function') {
        // ffmpeg -list_devices の出力をシミュレート
        const mockOutput = `
[AVFoundation indev @ 0x7f8b8b704680] AVFoundation video devices:
[AVFoundation indev @ 0x7f8b8b704680] [0] FaceTime HD Camera
[AVFoundation indev @ 0x7f8b8b704680] AVFoundation audio devices:
[AVFoundation indev @ 0x7f8b8b704680] [0] BlackHole 2ch
[AVFoundation indev @ 0x7f8b8b704680] [1] MacBook Pro Microphone
[AVFoundation indev @ 0x7f8b8b704680] [2] Microsoft Teams Audio
`;
        cb(null, mockOutput, '');
      }
    });
    exec.mockImplementation(mockExec);

    audioCapture = new AudioCapture();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listDevices', () => {
    it('利用可能な音声デバイスをリストできること', async () => {
      // 新しいインスタンスを作成して、execのモックがクリーンな状態であることを確認
      const newCapture = new AudioCapture();
      const devices = await newCapture.listDevices();
      
      expect(devices).toContain('BlackHole 2ch');
      expect(devices.length).toBeGreaterThan(0);
    });

    it('デバイスリストの取得に失敗した場合、エラーをスローすること', async () => {
      const { exec } = require('child_process');
      exec.mockImplementationOnce((cmd: string, options: any, callback?: Function) => {
        const cb = callback || options;
        cb(new Error('Command failed'), '', 'error');
      });

      await expect(audioCapture.listDevices()).rejects.toThrow('Failed to list audio devices');
    });
  });

  describe('startCapture', () => {
    it('指定したデバイスから音声キャプチャを開始できること', async () => {
      const deviceName = 'BlackHole 2ch';
      await audioCapture.startCapture(deviceName);

      const { spawn } = require('child_process');
      expect(spawn).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining([
        '-f', 'avfoundation',
        '-i', `:${deviceName}`,
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-f', 's16le',
        'pipe:1'
      ]));
    });

    it('音声データを受信したらaudioDataイベントを発火すること', async () => {
      const audioDataHandler = jest.fn();
      audioCapture.on('audioData', audioDataHandler);

      await audioCapture.startCapture('BlackHole 2ch');

      // FFmpegからのデータをシミュレート
      const testData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      mockFFmpeg.stdout!.emit('data', testData);

      expect(audioDataHandler).toHaveBeenCalledWith(testData);
    });

    it('既にキャプチャ中の場合、エラーをスローすること', async () => {
      await audioCapture.startCapture('BlackHole 2ch');
      
      await expect(audioCapture.startCapture('BlackHole 2ch'))
        .rejects.toThrow('Audio capture is already running');
    });

    it('存在しないデバイスを指定した場合、エラーをスローすること', async () => {
      const { spawn } = require('child_process');
      spawn.mockImplementation(() => {
        const proc = new EventEmitter() as any;
        proc.kill = jest.fn();
        proc.stdout = new EventEmitter() as any;
        proc.stderr = new EventEmitter() as any;
        
        // FFmpegエラーをシミュレート
        setTimeout(() => {
          proc.stderr.emit('data', Buffer.from('Device not found'));
          proc.emit('error', new Error('Device not found'));
        }, 10);
        
        return proc;
      });

      await expect(audioCapture.startCapture('NonExistentDevice'))
        .rejects.toThrow('Failed to start audio capture');
    });
  });

  describe('stopCapture', () => {
    it('音声キャプチャを停止できること', async () => {
      await audioCapture.startCapture('BlackHole 2ch');
      await audioCapture.stopCapture();

      expect(mockFFmpeg.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('キャプチャが開始されていない場合は何もしないこと', async () => {
      await audioCapture.stopCapture();
      expect(mockFFmpeg.kill).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('FFmpegプロセスがクラッシュした場合、errorイベントを発火すること', async () => {
      const errorHandler = jest.fn();
      audioCapture.on('error', errorHandler);

      await audioCapture.startCapture('BlackHole 2ch');
      
      const error = new Error('FFmpeg crashed');
      mockFFmpeg.emit('error', error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('デバイスが切断された場合、disconnectedイベントを発火すること', async () => {
      const disconnectedHandler = jest.fn();
      audioCapture.on('disconnected', disconnectedHandler);

      await audioCapture.startCapture('BlackHole 2ch');
      
      // デバイス切断をシミュレート
      mockFFmpeg.stderr!.emit('data', Buffer.from('Input/output error'));
      mockFFmpeg.emit('exit', 1);

      expect(disconnectedHandler).toHaveBeenCalled();
    });

    it('自動再接続が有効な場合、再接続を試行すること', async () => {
      audioCapture = new AudioCapture({ autoReconnect: true, reconnectDelay: 100 });
      
      const reconnectedHandler = jest.fn();
      audioCapture.on('reconnected', reconnectedHandler);

      await audioCapture.startCapture('BlackHole 2ch');
      
      // 切断をシミュレート
      mockFFmpeg.emit('exit', 1);

      // 再接続を待つ
      await new Promise(resolve => setTimeout(resolve, 200));

      const { spawn } = require('child_process');
      expect(spawn).toHaveBeenCalledTimes(2); // 初回 + 再接続
    });
  });

  describe('buffer management', () => {
    it('指定されたバッファサイズでデータをバッファリングすること', async () => {
      audioCapture = new AudioCapture({ bufferSize: 1024 });
      
      const audioDataHandler = jest.fn();
      audioCapture.on('audioData', audioDataHandler);

      await audioCapture.startCapture('BlackHole 2ch');

      // 小さなチャンクを複数送信
      for (let i = 0; i < 10; i++) {
        mockFFmpeg.stdout!.emit('data', Buffer.alloc(100));
      }

      // バッファサイズに達するまでイベントは発火しない
      expect(audioDataHandler).not.toHaveBeenCalled();

      // バッファサイズを超えるデータを送信
      mockFFmpeg.stdout!.emit('data', Buffer.alloc(100));
      
      expect(audioDataHandler).toHaveBeenCalledWith(
        expect.objectContaining({ length: 1024 })
      );
    });
  });
});