/**
 * Tsumiki AITDD - Green Phase
 * タスク49: GCP Speech-to-Textアダプタ実装
 */

import { STTPort, STTResult, STTError } from '../ports/stt';
import { SpeechClient } from '@google-cloud/speech';
import { Transform } from 'stream';
import { Logger } from '../logging/logger';

export interface GCPSpeechConfig {
  projectId?: string;
  keyFilename?: string;
  languageCode?: string;
  model?: string;
  logger?: Logger;
}

export class GCPSpeechAdapter implements STTPort {
  private client: SpeechClient;
  private config: GCPSpeechConfig;
  private logger?: Logger;
  private streamingRetryCount = 0;
  private maxStreamingRetries = 3;

  constructor(config: GCPSpeechConfig) {
    this.config = {
      languageCode: 'ja-JP',
      model: 'latest_long',
      ...config,
    };
    this.logger = config.logger;
    
    this.client = new SpeechClient({
      projectId: config.projectId,
      keyFilename: config.keyFilename,
    });
  }

  async transcribe(audio: Buffer, options?: any): Promise<STTResult> {
    try {
      const [response] = await this.client.recognize({
        audio: { content: audio.toString('base64') },
        config: {
          encoding: options?.encoding || 'WEBM_OPUS',
          sampleRateHertz: options?.sampleRate || 16000,
          languageCode: options?.languageCode || this.config.languageCode!,
          model: options?.model || this.config.model,
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
          enableAutomaticPunctuation: true,
        },
      });

      if (!response.results || response.results.length === 0) {
        return {
          transcript: '',
          confidence: 0,
          segments: [],
          timestamp: Date.now(),
          provider: 'gcp-speech',
        };
      }

      // 複数の結果を結合
      let fullTranscript = '';
      const allSegments: any[] = [];
      let totalConfidence = 0;
      let resultCount = 0;

      for (const result of response.results) {
        if (!result.alternatives || result.alternatives.length === 0) {
          continue;
        }

        const alternative = result.alternatives[0];
        if (!alternative) continue;
        
        fullTranscript += alternative.transcript || '';
        
        if (alternative.confidence) {
          totalConfidence += alternative.confidence;
          resultCount++;
        }

        // 単語レベルのタイムスタンプがある場合
        if (alternative.words && alternative.words.length > 0) {
          const firstWord = alternative.words[0];
          const lastWord = alternative.words[alternative.words.length - 1];
          if (firstWord && lastWord) {
            const segment = {
              text: alternative.transcript || '',
              startTime: this.timeToSeconds(firstWord.startTime),
              endTime: this.timeToSeconds(lastWord.endTime),
              confidence: alternative.confidence || 0,
            };
            allSegments.push(segment);
          }
        } else if (alternative.transcript) {
          // 単語情報がない場合
          allSegments.push({
            text: alternative.transcript,
            startTime: 0,
            endTime: 0,
            confidence: alternative.confidence || 0,
          });
        }
      }

      return {
        transcript: fullTranscript,
        confidence: resultCount > 0 ? totalConfidence / resultCount : 0,
        segments: allSegments,
        timestamp: Date.now(),
        provider: 'gcp-speech',
      };
    } catch (error: any) {
      this.logger?.error('GCP Speech transcription error', error);
      throw new STTError(
        'GCP Speech transcription failed',
        this.isRetryableError(error),
        'gcp-speech',
        error
      );
    }
  }

  async startStreaming(transform: Transform): Promise<Transform> {
    try {
      const stream = this.createStreamingRecognize(transform);
      
      // 設定を送信
      stream.write({
        streamingConfig: {
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 16000,
            languageCode: this.config.languageCode,
            model: this.config.model,
            enableWordTimeOffsets: true,
            enableWordConfidence: true,
            enableAutomaticPunctuation: true,
          },
          interimResults: true,
        },
      });

      // 音声データの送信
      transform.on('data', (chunk: Buffer) => {
        if (stream.writable) {
          stream.write({ audioContent: chunk });
        }
      });

      // ストリーム終了時の処理
      transform.on('end', () => {
        stream.end();
      });

      return transform;
    } catch (error: any) {
      this.logger?.error('GCP Speech streaming setup error', error);
      throw new STTError(
        'Failed to setup GCP Speech streaming',
        this.isRetryableError(error),
        'gcp-speech',
        error
      );
    }
  }

  private createStreamingRecognize(transform: Transform): any {
    const stream = this.client.streamingRecognize();

    stream.on('data', (response: any) => {
      if (!response.results || response.results.length === 0) {
        return;
      }

      for (const result of response.results) {
        if (!result.alternatives || result.alternatives.length === 0) {
          continue;
        }

        const alternative = result.alternatives[0];
        const segments = alternative.words?.map((word: any) => ({
          text: word.word,
          startTime: this.timeToSeconds(word.startTime),
          endTime: this.timeToSeconds(word.endTime),
          confidence: word.confidence || 0,
        })) || [];

        const sttResult: STTResult = {
          transcript: alternative.transcript || '',
          confidence: alternative.confidence || 0,
          segments: segments.length > 0 ? segments : [{
            text: alternative.transcript || '',
            startTime: 0,
            endTime: 0,
            confidence: alternative.confidence || 0,
          }],
          isFinal: result.isFinal,
          timestamp: Date.now(),
          provider: 'gcp-speech',
        };

        transform.push(sttResult);
      }
    });

    stream.on('error', (error: Error) => {
      this.logger?.error('GCP Speech streaming error', error);
      
      // 再接続を試みる
      if (this.streamingRetryCount < this.maxStreamingRetries) {
        this.streamingRetryCount++;
        this.logger?.info(`Retrying GCP Speech streaming (attempt ${this.streamingRetryCount})`);
        
        setTimeout(() => {
          const newStream = this.createStreamingRecognize(transform);
          // 新しいストリームに切り替え
          transform.emit('reconnected', newStream);
        }, 1000 * this.streamingRetryCount);
      } else {
        transform.emit('error', new STTError(
          'GCP Speech streaming error',
          true,
          'gcp-speech',
          error
        ));
      }
    });

    stream.on('end', () => {
      this.streamingRetryCount = 0;
    });

    return stream;
  }

  async isHealthy(): Promise<boolean> {
    try {
      // 小さなサンプル音声でヘルスチェック
      const silentAudio = Buffer.alloc(16000); // 1秒の無音
      await this.client.recognize({
        audio: { content: silentAudio.toString('base64') },
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: this.config.languageCode!,
        },
      });
      return true;
    } catch (error: any) {
      this.logger?.error('GCP Speech health check failed', error);
      return false;
    }
  }

  private timeToSeconds(time: any): number {
    if (!time) return 0;
    const seconds = parseInt(time.seconds || '0', 10);
    const nanos = parseInt(time.nanos || '0', 10);
    return seconds + nanos / 1_000_000_000;
  }

  private isRetryableError(error: any): boolean {
    // gRPCエラーコード
    const retryableCodes = [
      1,  // CANCELLED
      4,  // DEADLINE_EXCEEDED
      8,  // RESOURCE_EXHAUSTED
      10, // ABORTED
      13, // INTERNAL
      14, // UNAVAILABLE
    ];

    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }

    // 認証エラーはリトライ不可能
    if (error.code === 16 || // UNAUTHENTICATED
        error.code === 7) {   // PERMISSION_DENIED
      return false;
    }

    return true;
  }
}
