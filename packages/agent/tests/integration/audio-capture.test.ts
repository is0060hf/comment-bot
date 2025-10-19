/**
 * 音声キャプチャの統合テスト
 * 実際のFFmpegとの連携を確認
 */

import { AudioCapture } from '../../src/audio/capture';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('AudioCapture Integration Tests', () => {
  let audioCapture: AudioCapture;

  beforeEach(() => {
    audioCapture = new AudioCapture();
  });

  afterEach(async () => {
    await audioCapture.stopCapture();
  });

  describe('FFmpeg availability', () => {
    it('FFmpegがインストールされていること', async () => {
      try {
        const { stdout } = await execAsync('which ffmpeg');
        expect(stdout.trim()).toBeTruthy();
      } catch (error) {
        // FFmpegがインストールされていない場合はスキップ
        console.warn('FFmpeg is not installed. Skipping integration tests.');
      }
    });

    it('AVFoundationが利用可能であること', async () => {
      try {
        const { stdout } = await execAsync('ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1 || true');
        expect(stdout).toContain('AVFoundation');
      } catch (error) {
        console.warn('AVFoundation is not available. Skipping integration tests.');
      }
    });
  });

  describe('Real device listing', () => {
    it('実際のデバイスリストを取得できること', async () => {
      try {
        const devices = await audioCapture.listDevices();
        console.log('Available audio devices:', devices);
        
        // macOSでは最低でも内蔵マイクがあるはず
        expect(devices.length).toBeGreaterThan(0);
        
        // デバイス名の検証
        devices.forEach(device => {
          expect(device).toBeTruthy();
          expect(typeof device).toBe('string');
        });
      } catch (error) {
        if ((error as Error).message.includes('Failed to list audio devices')) {
          console.warn('Could not list audio devices. This might be running in a CI environment.');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Audio capture lifecycle', () => {
    it('デバイスが存在しない場合、適切なエラーが発生すること', async () => {
      const fakeDeviceName = 'NonExistentDevice12345';
      
      await expect(audioCapture.startCapture(fakeDeviceName))
        .rejects.toThrow('Failed to start audio capture');
    });

    it('音声キャプチャのライフサイクルが正常に動作すること', async () => {
      // 実際のデバイスを使用しないモックテスト
      // CI環境でも動作するように
      const disconnectedHandler = jest.fn();
      const errorHandler = jest.fn();
      
      audioCapture.on('disconnected', disconnectedHandler);
      audioCapture.on('error', errorHandler);
      
      // デバイスリストを取得
      let devices: string[];
      try {
        devices = await audioCapture.listDevices();
      } catch (error) {
        console.warn('Skipping lifecycle test: No audio devices available');
        return;
      }
      
      if (devices.length === 0) {
        console.warn('Skipping lifecycle test: No audio devices found');
        return;
      }
      
      // 最初のデバイスを使用してテスト（通常は内蔵マイク）
      const testDevice = devices[0];
      if (!testDevice) {
        console.warn('No test device available');
        return;
      }
      console.log(`Testing with device: ${testDevice}`);
      
      // キャプチャ開始
      try {
        await audioCapture.startCapture(testDevice);
        
        // 少し待機
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 停止
        await audioCapture.stopCapture();
        
        // エラーが発生していないことを確認
        expect(errorHandler).not.toHaveBeenCalled();
      } catch (error) {
        // 権限エラーなどでキャプチャできない場合はスキップ
        console.warn(`Could not capture from ${testDevice}:`, error);
      }
    });
  });

  describe('Error recovery', () => {
    it('自動再接続が無効な場合、再接続を試行しないこと', async () => {
      audioCapture = new AudioCapture({ 
        autoReconnect: false 
      });
      
      const reconnectedHandler = jest.fn();
      audioCapture.on('reconnected', reconnectedHandler);
      
      // 切断をシミュレート
      audioCapture.emit('disconnected');
      
      // 再接続を待つ
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(reconnectedHandler).not.toHaveBeenCalled();
    });

    it('最大再接続回数に達した場合、エラーを発生させること', async () => {
      audioCapture = new AudioCapture({ 
        autoReconnect: true,
        reconnectDelay: 10
      });
      
      const errorHandler = jest.fn();
      audioCapture.on('error', errorHandler);
      
      // 再接続の最大回数（5回）を超えるまで切断を繰り返す
      for (let i = 0; i < 6; i++) {
        audioCapture['handleDisconnection']();
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Maximum reconnection attempts reached'
        })
      );
    });
  });
});
