/**
 * 音声キャプチャモジュール
 * macOSの仮想音声デバイス（BlackHole）から音声を取得
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';

export interface AudioBuffer {
  data: Buffer;
  sampleRate: number;
  channels: number;
  timestamp: number;
}

export interface AudioDevice {
  id: string;
  name: string;
  type: 'input' | 'output';
}

export interface AudioCaptureConfig {
  deviceName: string;
  sampleRate: number;
  channels: number;
  bufferSize: number;
  sourceSampleRate?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export class AudioCapture extends EventEmitter {
  private config: AudioCaptureConfig;
  private capturing = false;
  private process: ChildProcess | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

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
    return new Promise((resolve, reject) => {
      const devices: AudioDevice[] = [];
      
      // macOSのsystem_profilerを使用してオーディオデバイスを列挙
      const proc = spawn('system_profiler', ['SPAudioDataType', '-json']);
      let output = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to list audio devices: exit code ${code}`));
          return;
        }
        
        try {
          const data = JSON.parse(output);
          const audioData = data.SPAudioDataType || [];
          
          audioData.forEach((item: any) => {
            // 入力デバイス
            if (item._items) {
              item._items.forEach((device: any) => {
                if (device.coreaudio_input_source) {
                  devices.push({
                    id: device._name,
                    name: device._name,
                    type: 'input',
                  });
                }
                if (device.coreaudio_output_source) {
                  devices.push({
                    id: device._name,
                    name: device._name,
                    type: 'output',
                  });
                }
              });
            }
          });
          
          // 簡易的なフォールバック（BlackHoleが見つからない場合）
          if (devices.length === 0) {
            devices.push({
              id: 'default',
              name: 'Default Audio Device',
              type: 'input',
            });
          }
          
          resolve(devices);
        } catch (error) {
          reject(new Error(`Failed to parse audio device data: ${error}`));
        }
      });
      
      proc.on('error', reject);
    });
  }

  static async listInputDevices(): Promise<AudioDevice[]> {
    const devices = await this.listDevices();
    return devices.filter(device => device.type === 'input');
  }

  async start(): Promise<void> {
    if (this.capturing) {
      throw new Error('Already capturing');
    }

    try {
      await this.startCapture();
      this.capturing = true;
      this.reconnectAttempts = 0;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async startCapture(): Promise<void> {
    return new Promise((resolve, reject) => {
      // ffmpegを使用して音声キャプチャ
      // macOSではAVFoundationを使用
      const args = [
        '-f', 'avfoundation',
        '-i', `:${this.config.deviceName}`,
        '-acodec', 'pcm_s16le',
        '-ar', this.config.sampleRate.toString(),
        '-ac', this.config.channels.toString(),
        '-f', 's16le',
        '-blocksize', this.config.bufferSize.toString(),
        'pipe:1',
      ];

      this.process = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let started = false;

      this.process.stdout?.on('data', (data: Buffer) => {
        if (!started) {
          started = true;
          resolve();
        }

        const audioBuffer: AudioBuffer = {
          data,
          sampleRate: this.config.sampleRate,
          channels: this.config.channels,
          timestamp: Date.now(),
        };

        this.emit('data', audioBuffer);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString();
        
        // ffmpegの起動確認
        if (!started && message.includes('Stream mapping:')) {
          started = true;
          resolve();
        }
        
        // エラーチェック
        if (message.includes('error') || message.includes('Error')) {
          const error = new Error(`FFmpeg error: ${message}`);
          if (!started) {
            reject(error);
          } else {
            this.emit('error', error);
            this.handleDisconnect();
          }
        }
      });

      this.process.on('error', (error) => {
        if (!started) {
          reject(error);
        } else {
          this.emit('error', error);
          this.handleDisconnect();
        }
      });

      this.process.on('close', (code) => {
        if (!started && code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code}`));
        } else if (this.capturing) {
          this.handleDisconnect();
        }
      });

      // タイムアウト設定
      setTimeout(() => {
        if (!started) {
          this.process?.kill();
          reject(new Error('Capture start timeout - device may not exist'));
        }
      }, 5000);
    });
  }

  async stop(): Promise<void> {
    this.capturing = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.process) {
      this.process.kill('SIGTERM');
      
      // プロセスの終了を待つ
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.process || this.process.killed) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        
        // 強制終了のタイムアウト
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
          clearInterval(checkInterval);
          resolve();
        }, 2000);
      });
      
      this.process = null;
    }
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  // テスト用メソッド
  simulateDisconnect(): void {
    if (this.process) {
      this.process.kill();
    }
  }

  private handleDisconnect(): void {
    if (!this.capturing || !this.config.autoReconnect) {
      return;
    }

    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > (this.config.maxReconnectAttempts || 5)) {
      this.emit('error', new Error('Max reconnection attempts exceeded'));
      this.stop();
      return;
    }

    this.emit('reconnecting', this.reconnectAttempts);
    
    // 指数バックオフで再接続
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    this.reconnectTimer = setTimeout(async () => {
      if (this.capturing) {
        try {
          await this.startCapture();
          this.emit('reconnected');
          this.reconnectAttempts = 0;
        } catch (error) {
          this.handleDisconnect();
        }
      }
    }, delay);
  }
}
