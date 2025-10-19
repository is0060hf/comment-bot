/**
 * Tsumiki AITDD - Green Phase
 * タスク49: OpenAI Whisperアダプタ実装
 */

import { STTPort, STTResult, STTError } from '../ports/stt';
import OpenAI from 'openai';
import { Transform } from 'stream';
import { Logger } from '../logging/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface WhisperConfig {
  apiKey: string;
  model?: string;
  language?: string;
  logger?: Logger;
}

export class WhisperAdapter implements STTPort {
  private openai: OpenAI;
  private config: WhisperConfig;
  private logger?: Logger;
  private maxFileSize = 25 * 1024 * 1024; // 25MB

  constructor(config: WhisperConfig) {
    this.config = {
      model: 'whisper-1',
      language: 'ja',
      ...config,
    };
    this.logger = config.logger;
    this.openai = new OpenAI({ apiKey: config.apiKey });
  }

  async transcribe(audio: Buffer, options?: any): Promise<STTResult> {
    try {
      // ファイルサイズチェック
      if (audio.length > this.maxFileSize) {
        const error = `Audio file too large: ${audio.length} bytes (max: ${this.maxFileSize} bytes)`;
        this.logger?.error(error, {
          size: audio.length,
          maxSize: this.maxFileSize,
        });
        throw new STTError(error, false, 'whisper');
      }

      // 一時ファイルを作成（Whisper APIはファイルを要求）
      const tempFile = path.join(os.tmpdir(), `whisper-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, audio);

      try {
        const response = await this.openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFile) as any,
          model: options?.model || this.config.model!,
          language: options?.language || this.config.language,
          response_format: 'verbose_json',
          prompt: options?.prompt,
          temperature: options?.temperature,
        });

        // 一時ファイルを削除
        fs.unlinkSync(tempFile);

        return this.parseWhisperResponse(response);
      } catch (error) {
        // 一時ファイルを削除
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        throw error;
      }
    } catch (error: any) {
      if (error instanceof STTError) {
        throw error;
      }

      this.logger?.error('Whisper transcription error', error);
      throw new STTError(
        'Whisper transcription failed',
        this.isRetryableError(error),
        'whisper',
        error
      );
    }
  }

  async startStreaming(_transform: Transform): Promise<Transform> {
    // Whisperはストリーミングをサポートしていない
    this.logger?.warn('Whisper streaming not supported, falling back to batch processing');
    
    throw new STTError(
      'Whisper does not support streaming',
      false,
      'whisper'
    );
  }

  async isHealthy(): Promise<boolean> {
    try {
      // 小さなテスト音声でヘルスチェック
      const testAudio = Buffer.alloc(16000); // 1秒の無音
      const tempFile = path.join(os.tmpdir(), `whisper-health-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, testAudio);

      try {
        await this.openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFile) as any,
          model: this.config.model!,
          response_format: 'text',
        });
        fs.unlinkSync(tempFile);
        return true;
      } catch (error) {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        throw error;
      }
    } catch (error: any) {
      this.logger?.error('Whisper health check failed', error);
      return false;
    }
  }

  private parseWhisperResponse(response: any): STTResult {
    // 空の結果
    if (!response.text) {
      return {
        transcript: '',
        confidence: 0,
        segments: [],
        timestamp: Date.now(),
        provider: 'whisper',
        language: response.language,
      };
    }

    // セグメント情報がある場合
    if (response.segments && Array.isArray(response.segments)) {
      const segments = response.segments.map((segment: any) => ({
        text: segment.text || '',
        startTime: segment.start || 0,
        endTime: segment.end || 0,
        confidence: this.logProbToConfidence(segment.avg_logprob),
      }));

      // 全体の信頼度を計算
      const avgConfidence = segments.length > 0
        ? segments.reduce((sum: number, seg: any) => sum + seg.confidence, 0) / segments.length
        : 0.9;

      return {
        transcript: response.text,
        confidence: avgConfidence,
        segments,
        timestamp: Date.now(),
        provider: 'whisper',
        language: response.language,
      };
    }

    // シンプルなテキストのみの応答
    return {
      transcript: response.text,
      confidence: 0.9, // デフォルト
      segments: [{
        text: response.text,
        startTime: 0,
        endTime: response.duration || 0,
        confidence: 0.9,
      }],
      timestamp: Date.now(),
      provider: 'whisper',
      language: response.language,
    };
  }

  private logProbToConfidence(logProb?: number): number {
    if (logProb === undefined || logProb === null) {
      return 0.9;
    }
    // log probabilityを0-1の信頼度スコアに変換
    // log prob は通常負の値で、0に近いほど信頼度が高い
    return Math.exp(logProb);
  }

  private isRetryableError(error: any): boolean {
    // HTTPステータスコードベースの判定
    if (error.status === 429) { // Rate limit
      return true;
    }
    if (error.status === 401 || error.status === 403) { // Authentication
      return false;
    }
    if (error.status >= 500) { // Server errors
      return true;
    }

    // ネットワークエラー
    if (error.code === 'ETIMEDOUT' || 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND') {
      return true;
    }

    return false;
  }
}
