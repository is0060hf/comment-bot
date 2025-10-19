/**
 * ストリーミングSTTモジュール
 * 音声ストリームをリアルタイムでテキストに変換
 */

import { EventEmitter } from 'events';
import { Writable, Duplex, Transform } from 'stream';
import { STTPort } from '../ports/stt';

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  timestamp: number;
  language: string;
  alternatives: Array<{
    text: string;
    confidence: number;
  }>;
}

export interface STTConfig {
  adapter: STTPort;
  language: string;
  interimResults: boolean;
  punctuation: boolean;
  wordTimestamps: boolean;
  maxAlternatives: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export class StreamingSTT extends EventEmitter {
  private config: STTConfig;
  private streaming = false;
  private stream: Duplex | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: STTConfig) {
    super();
    
    if (!config.adapter) {
      throw new Error('STT adapter is required');
    }
    
    this.config = {
      autoReconnect: false,
      maxReconnectAttempts: 5,
      ...config,
    };
  }

  getConfig(): STTConfig {
    return { ...this.config };
  }

  async start(): Promise<Writable> {
    if (this.streaming) {
      throw new Error('Already streaming');
    }

    try {
      this.stream = await this.startStream();
      this.streaming = true;
      this.reconnectAttempts = 0;
      
      // ストリームイベントの設定
      this.setupStreamHandlers();
      
      return this.stream;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async startStream(): Promise<Duplex> {
    const transform = new Transform({
      transform(chunk, _encoding, callback) {
        callback(null, chunk);
      }
    });
    
    const stream = await this.config.adapter.startStreaming(transform);
    
    // ストリーミング設定をアダプタに渡す（実装依存）
    if ('configure' in stream && typeof stream.configure === 'function') {
      (stream as any).configure({
        language: this.config.language,
        interimResults: this.config.interimResults,
        punctuation: this.config.punctuation,
        wordTimestamps: this.config.wordTimestamps,
        maxAlternatives: this.config.maxAlternatives,
      });
    }
    
    return stream as Duplex;
  }

  private setupStreamHandlers(): void {
    if (!this.stream) return;

    this.stream.on('data', (data: any) => {
      // STTアダプタからの結果を正規化
      const result = this.normalizeResult(data);
      this.emit('transcript', result);
    });

    this.stream.on('error', (error: any) => {
      this.emit('error', error);
      
      // 再接続可能なエラーかチェック
      if (this.isRetryableError(error)) {
        this.handleDisconnect();
      }
    });

    this.stream.on('close', () => {
      if (this.streaming) {
        this.handleDisconnect();
      }
    });
  }

  private normalizeResult(data: any): TranscriptResult {
    // アダプタからのデータを統一フォーマットに変換
    if (data && typeof data === 'object' && 'text' in data) {
      return {
        text: data.text || '',
        isFinal: data.isFinal ?? true,
        confidence: data.confidence ?? 1.0,
        timestamp: data.timestamp ?? Date.now(),
        language: data.language ?? this.config.language,
        alternatives: data.alternatives ?? [],
      };
    }
    
    // フォールバック
    return {
      text: String(data),
      isFinal: true,
      confidence: 1.0,
      timestamp: Date.now(),
      language: this.config.language,
      alternatives: [],
    };
  }

  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    // 再接続可能なエラーコード
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH'];
    
    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }
    
    if (error.retryable === true) {
      return true;
    }
    
    return false;
  }

  async stop(): Promise<void> {
    this.streaming = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.stream) {
      this.stream.destroy();
      
      // ストリームの完全な終了を待つ
      await new Promise<void>((resolve) => {
        if (!this.stream) {
          resolve();
          return;
        }
        
        const checkInterval = setInterval(() => {
          if (!this.stream || this.stream.destroyed) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        
        // タイムアウト
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 2000);
      });
      
      this.stream = null;
    }
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  private handleDisconnect(): void {
    if (!this.streaming || !this.config.autoReconnect) {
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
      if (this.streaming) {
        try {
          this.stream = await this.startStream();
          this.setupStreamHandlers();
          this.emit('reconnected');
          this.reconnectAttempts = 0;
        } catch (error) {
          this.handleDisconnect();
        }
      }
    }, delay);
  }
}
