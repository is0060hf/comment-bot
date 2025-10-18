/**
 * 音声関連のインターフェース定義
 */

export interface IAudioCapture {
  start(): Promise<void>;
  stop(): Promise<void>;
  isCapturing(): boolean;
  getConfig(): AudioCaptureConfig;
  on(event: 'data', listener: (buffer: AudioBuffer) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'reconnecting', listener: (attempt: number) => void): this;
  on(event: 'reconnected', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
}

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
