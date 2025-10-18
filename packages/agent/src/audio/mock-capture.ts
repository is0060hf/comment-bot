/**
 * モック音声キャプチャ（テスト用）
 */

import { EventEmitter } from 'events';
import { AudioBuffer, AudioDevice, AudioCaptureConfig } from './capture';

export class MockAudioCapture extends EventEmitter {
  private config: AudioCaptureConfig;
  private interval: NodeJS.Timeout | null = null;
  private _capturing = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private simulatedDevices: AudioDevice[] = [
    { id: 'blackhole', name: 'BlackHole 2ch', type: 'input' },
    { id: 'default', name: 'Default Audio Device', type: 'input' },
    { id: 'builtin', name: 'Built-in Microphone', type: 'input' },
    { id: 'speakers', name: 'Built-in Speakers', type: 'output' },
  ];

  constructor(config: AudioCaptureConfig) {
    super();
    
    if (config.sampleRate <= 0) {
      throw new Error('Invalid sample rate');
    }
    if (config.channels <= 0) {
      throw new Error('Invalid channel count');
    }
    
    this.config = {
      autoReconnect: false,
      maxReconnectAttempts: 5,
      ...config,
    };
  }

  getConfig(): AudioCaptureConfig {
    return { ...this.config };
  }

  static async listDevices(): Promise<AudioDevice[]> {
    return Promise.resolve([
      { id: 'blackhole', name: 'BlackHole 2ch', type: 'input' },
      { id: 'default', name: 'Default Audio Device', type: 'input' },
      { id: 'builtin', name: 'Built-in Microphone', type: 'input' },
      { id: 'speakers', name: 'Built-in Speakers', type: 'output' },
    ]);
  }

  static async listInputDevices(): Promise<AudioDevice[]> {
    const devices = await this.listDevices();
    return devices.filter(device => device.type === 'input');
  }

  async start(): Promise<void> {
    if (this._capturing) {
      throw new Error('Already capturing');
    }

    const config = this.config;
    const device = this.simulatedDevices.find(d => d.name === config.deviceName);
    
    if (!device || device.name === 'NonExistentDevice') {
      const error = new Error(`Audio device not found: ${config.deviceName}`);
      this.emit('error', error);
      throw error;
    }

    this._capturing = true;
    
    // シミュレートされた音声データを定期的に送信
    this.interval = setInterval(() => {
      if (!this._capturing) return;
      
      // ダミーの音声データを生成
      const samples = config.bufferSize / 2; // 16bit = 2 bytes per sample
      const buffer = Buffer.alloc(config.bufferSize);
      
      for (let i = 0; i < samples; i++) {
        // サイン波を生成（440Hz）
        const t = i / config.sampleRate;
        const value = Math.sin(2 * Math.PI * 440 * t) * 32767;
        buffer.writeInt16LE(Math.floor(value), i * 2);
      }
      
      const audioBuffer: AudioBuffer = {
        data: buffer,
        sampleRate: config.sampleRate,
        channels: config.channels,
        timestamp: Date.now(),
      };
      
      this.emit('data', audioBuffer);
    }, Math.floor(config.bufferSize / config.sampleRate * 1000));
  }

  async stop(): Promise<void> {
    this._capturing = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  isCapturing(): boolean {
    return this._capturing;
  }

  simulateDisconnect(): void {
    if (this._capturing && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.emit('error', new Error('Device disconnected'));
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    const config = this.config;
    if (!this._capturing || !config.autoReconnect) {
      this._capturing = false;
      return;
    }

    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > (config.maxReconnectAttempts || 5)) {
      this._capturing = false;
      this.emit('error', new Error('Max reconnection attempts exceeded'));
      return;
    }

    this.emit('reconnecting', this.reconnectAttempts);
    
    // 指数バックオフで再接続
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    this.reconnectTimer = setTimeout(async () => {
      if (this._capturing) {
        try {
          // 再接続をシミュレート - 内部的にstartの処理を再実行
          const config = this.config;
          this.interval = setInterval(() => {
            if (!this._capturing) return;
            
            const samples = config.bufferSize / 2;
            const buffer = Buffer.alloc(config.bufferSize);
            
            for (let i = 0; i < samples; i++) {
              const t = i / config.sampleRate;
              const value = Math.sin(2 * Math.PI * 440 * t) * 32767;
              buffer.writeInt16LE(Math.floor(value), i * 2);
            }
            
            const audioBuffer: AudioBuffer = {
              data: buffer,
              sampleRate: config.sampleRate,
              channels: config.channels,
              timestamp: Date.now(),
            };
            
            this.emit('data', audioBuffer);
          }, Math.floor(config.bufferSize / config.sampleRate * 1000));
          
          this.emit('reconnected');
          this.reconnectAttempts = 0;
        } catch (error) {
          this.handleDisconnect();
        }
      }
    }, delay);
  }
}
