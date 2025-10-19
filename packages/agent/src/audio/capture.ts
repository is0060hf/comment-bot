/**
 * 音声キャプチャ
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { Logger, LogLevel } from '../logging/logger';

const execAsync = promisify(exec);

/**
 * 音声キャプチャの設定
 */
export interface AudioCaptureConfig {
  /** 音声デバイス名（例: "BlackHole 2ch"） */
  deviceName?: string;
  /** サンプリングレート（Hz） */
  sampleRate?: number;
  /** チャンネル数（1: mono, 2: stereo） */
  channels?: number;
  /** 自動再接続 */
  autoReconnect?: boolean;
  /** 再接続遅延（ミリ秒） */
  reconnectDelay?: number;
  /** バッファサイズ（バイト） */
  bufferSize?: number;
}

/**
 * 音声キャプチャクラス
 * macOSのAVFoundationを使用して音声をキャプチャ
 */
export class AudioCapture extends EventEmitter {
  private config: AudioCaptureConfig;
  private ffmpegProcess: ChildProcess | null = null;
  private isCapturing = false;
  private buffer: Buffer = Buffer.alloc(0);
  private reconnectTimer?: NodeJS.Timeout;
  private currentDevice?: string;
  private logger: Logger;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  constructor(config: AudioCaptureConfig = {}) {
    super();
    this.config = {
      sampleRate: 16000,
      channels: 1,
      autoReconnect: false,
      reconnectDelay: 1000,
      bufferSize: 0,
      ...config
    };
    this.logger = new Logger({ level: LogLevel.INFO });
  }

  /**
   * 利用可能な音声デバイスをリスト
   */
  async listDevices(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true');
      const lines = stdout.split('\n');
      const audioDevices: string[] = [];
      let inAudioSection = false;

      for (const line of lines) {
        if (line.includes('AVFoundation audio devices:')) {
          inAudioSection = true;
          continue;
        }
        if (line.includes('AVFoundation video devices:') && inAudioSection) {
          break;
        }
        if (inAudioSection) {
          // 2つの異なるフォーマットに対応
          const match = line.match(/\[AVFoundation .+\] \[(\d+)\] (.+)/) || 
                       line.match(/\[\d+\] (.+)/);
          if (match) {
            const deviceName = match[2] || match[1];
            if (deviceName && deviceName.trim()) {
              audioDevices.push(deviceName.trim());
            }
          }
        }
      }

      return audioDevices;
    } catch (error) {
      throw new Error('Failed to list audio devices');
    }
  }

  /**
   * 静的メソッドとしても提供
   */
  static async listDevices(): Promise<string[]> {
    const instance = new AudioCapture();
    return instance.listDevices();
  }

  /**
   * 音声キャプチャを開始
   */
  async startCapture(deviceName: string): Promise<void> {
    if (this.isCapturing) {
      throw new Error('Audio capture is already running');
    }

    this.currentDevice = deviceName;
    this.isCapturing = true;
    this.logger.info(`Starting audio capture from device: ${deviceName}`);

    return new Promise((resolve, reject) => {
      try {
        // FFmpegコマンドの構築
        const args = [
          '-f', 'avfoundation',
          '-i', `:${deviceName}`,
          '-acodec', 'pcm_s16le',
          '-ar', String(this.config.sampleRate),
          '-ac', String(this.config.channels),
          '-f', 's16le',
          'pipe:1'
        ];

        this.ffmpegProcess = spawn('ffmpeg', args);
        let hasStarted = false;

        // 標準出力（音声データ）の処理
        this.ffmpegProcess.stdout?.on('data', (data: Buffer) => {
          if (!hasStarted) {
            hasStarted = true;
            resolve();
          }
          
          if (this.config.bufferSize && this.config.bufferSize > 0) {
            // バッファリング処理
            this.buffer = Buffer.concat([this.buffer, data]);
            
            while (this.buffer.length >= this.config.bufferSize) {
              const chunk = this.buffer.slice(0, this.config.bufferSize);
              this.buffer = this.buffer.slice(this.config.bufferSize);
              this.emit('audioData', chunk);
            }
          } else {
            // バッファリングなし
            this.emit('audioData', data);
          }
        });

        // エラー処理
        this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
          const message = data.toString();
          if (message.includes('Input/output error')) {
            this.handleDisconnection();
          } else if (message.includes('Device not found')) {
            if (!hasStarted) {
              this.cleanup();
              reject(new Error('Failed to start audio capture'));
            } else {
              this.emit('error', new Error('Device not found'));
              this.cleanup();
            }
          }
        });

        // プロセスエラー
        this.ffmpegProcess.on('error', (error) => {
          if (!hasStarted) {
            this.cleanup();
            reject(new Error('Failed to start audio capture'));
          } else {
            this.emit('error', error);
            this.cleanup();
          }
        });

        // プロセス終了
        this.ffmpegProcess.on('exit', (code) => {
          if (code !== 0 && this.isCapturing) {
            this.handleDisconnection();
          }
        });

        // タイムアウト処理
        setTimeout(() => {
          if (!hasStarted) {
            hasStarted = true;
            resolve();
          }
        }, 100);

      } catch (error) {
        this.cleanup();
        reject(new Error('Failed to start audio capture'));
      }
    });
  }

  /**
   * 音声キャプチャを停止
   */
  async stopCapture(): Promise<void> {
    if (!this.isCapturing) {
      return;
    }

    this.cleanup();
  }

  /**
   * クリーンアップ
   */
  private cleanup(): void {
    this.isCapturing = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }

    this.buffer = Buffer.alloc(0);
  }

  /**
   * 切断処理
   */
  private handleDisconnection(): void {
    this.emit('disconnected');
    this.logger.warn('Audio device disconnected');
    
    const wasCapturing = this.isCapturing;
    this.cleanup();

    if (this.config.autoReconnect && this.currentDevice && wasCapturing) {
      if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
        this.logger.error(`Maximum reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached`);
        this.emit('error', new Error('Maximum reconnection attempts reached'));
        return;
      }

      this.reconnectAttempts++;
      const delay = this.config.reconnectDelay! * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
      
      this.logger.info(`Attempting to reconnect (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}) in ${delay}ms`);
      
      this.reconnectTimer = setTimeout(() => {
        this.startCapture(this.currentDevice!)
          .then(() => {
            this.reconnectAttempts = 0; // Reset on successful connection
            this.logger.info('Successfully reconnected to audio device');
            this.emit('reconnected');
          })
          .catch((error) => {
            this.logger.error('Failed to reconnect', error);
            this.emit('error', error);
            // Will retry again if attempts remain
            this.handleDisconnection();
          });
      }, delay);
    }
  }
}