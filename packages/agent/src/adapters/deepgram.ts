/**
 * Tsumiki AITDD - Green Phase
 * タスク49: Deepgramアダプタ実装
 */

import { STTPort, STTResult, STTError } from '../ports/stt';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { Transform } from 'stream';
import { Logger } from '../logging/logger';

export interface DeepgramConfig {
  apiKey: string;
  model?: string;
  language?: string;
  logger?: Logger;
}

export class DeepgramAdapter implements STTPort {
  private client: any;
  private config: DeepgramConfig;
  private logger?: Logger;

  constructor(config: DeepgramConfig) {
    this.config = {
      model: 'nova-2',
      language: 'ja',
      ...config,
    };
    this.logger = config.logger;
    this.client = createClient(config.apiKey);
  }

  async transcribe(audio: Buffer, options?: any): Promise<STTResult> {
    try {
      const response = await this.client.listen.prerecorded.transcribeFile(
        audio,
        {
          model: options?.model || this.config.model,
          language: options?.language || this.config.language,
          punctuate: options?.punctuate ?? true,
          utterances: options?.utterances ?? true,
          diarize: options?.diarize ?? false,
          mimetype: 'audio/wav',
        }
      );

      const channel = response.results?.channels?.[0];
      if (!channel || !channel.alternatives?.length) {
        return {
          transcript: '',
          confidence: 0,
          segments: [],
          timestamp: Date.now(),
          provider: 'deepgram',
        };
      }

      const alternative = channel.alternatives[0];
      const segments = alternative.words?.map((word: any) => ({
        text: word.word,
        startTime: word.start || 0,
        endTime: word.end || 0,
        confidence: word.confidence || 0,
      })) || [];

      // 単語がない場合は全体を1つのセグメントとして扱う
      if (segments.length === 0 && alternative.transcript) {
        segments.push({
          text: alternative.transcript,
          startTime: 0,
          endTime: response.metadata?.duration || 0,
          confidence: alternative.confidence || 0,
        });
      }

      return {
        transcript: alternative.transcript || '',
        confidence: alternative.confidence || 0,
        segments,
        timestamp: Date.now(),
        provider: 'deepgram',
      };
    } catch (error: any) {
      this.logger?.error('Deepgram transcription error', error);
      throw new STTError(
        'Deepgram transcription failed',
        this.isRetryableError(error),
        'deepgram',
        error
      );
    }
  }

  async startStreaming(transform: Transform): Promise<Transform> {
    try {
      const connection = this.client.listen.live({
        model: this.config.model,
        language: this.config.language,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        encoding: 'linear16',
        sample_rate: 16000,
      });

      // Deepgramからの結果を変換
      connection.on(LiveTranscriptionEvents.Transcript, (result: any) => {
        const channel = result.channel;
        if (!channel || !channel.alternatives?.length) {
          return;
        }

        const alternative = channel.alternatives[0];
        const sttResult: STTResult = {
          transcript: alternative.transcript || '',
          confidence: alternative.confidence || 0,
          segments: alternative.words?.map((word: any) => ({
            text: word.word,
            startTime: word.start || 0,
            endTime: word.end || 0,
            confidence: word.confidence || 0,
          })) || [],
          isFinal: result.is_final && result.speech_final,
          timestamp: Date.now(),
          provider: 'deepgram',
        };

        transform.push(sttResult);
      });

      // VADイベント
      connection.on(LiveTranscriptionEvents.Metadata, (metadata: any) => {
        if (metadata.type) {
          this.logger?.debug('Deepgram VAD event', { type: metadata.type });
        }
      });

      // エラーハンドリング
      connection.on(LiveTranscriptionEvents.Error, (error: Error) => {
        this.logger?.error('Deepgram streaming error', error);
        transform.emit('error', new STTError(
          'Deepgram streaming error',
          true,
          'deepgram',
          error
        ));
      });

      // 音声データの送信
      transform.on('data', (chunk: Buffer) => {
        connection.send(chunk);
      });

      // ストリーム終了時の処理
      transform.on('end', () => {
        connection.finish();
      });

      return transform;
    } catch (error: any) {
      this.logger?.error('Deepgram streaming setup error', error);
      throw new STTError(
        'Failed to setup Deepgram streaming',
        this.isRetryableError(error),
        'deepgram',
        error
      );
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      // 小さなサンプル音声でヘルスチェック
      const silentAudio = Buffer.alloc(16000); // 1秒の無音
      await this.client.listen.prerecorded.transcribeFile(
        silentAudio,
        { 
          model: this.config.model, 
          language: this.config.language,
          mimetype: 'audio/wav'
        }
      );
      return true;
    } catch (error: any) {
      this.logger?.error('Deepgram health check failed', error);
      return false;
    }
  }

  private isRetryableError(error: any): boolean {
    // ネットワークエラーやタイムアウトはリトライ可能
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND') {
      return true;
    }

    // 認証エラーはリトライ不可能
    if (error.message?.toLowerCase().includes('api key') ||
        error.message?.toLowerCase().includes('unauthorized')) {
      return false;
    }

    // デフォルトはリトライ可能
    return true;
  }
}
