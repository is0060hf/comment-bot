/**
 * STT関連のインターフェース定義
 */

import { Writable } from 'stream';
import { STTPort } from '../ports/stt';

export interface IStreamingSTT {
  start(): Promise<Writable>;
  stop(): Promise<void>;
  isStreaming(): boolean;
  getConfig(): STTConfig;
  on(event: 'transcript', listener: (result: TranscriptResult) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'reconnecting', listener: (attempt: number) => void): this;
  on(event: 'reconnected', listener: () => void): this;
}

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
