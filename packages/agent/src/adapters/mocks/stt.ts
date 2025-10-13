import { Readable, Writable, Transform } from 'stream';
import { STTPort, STTResult, STTError } from '../../ports/stt';

/**
 * MockSTTアダプタの設定
 */
export interface MockSTTConfig {
  /** 失敗率 (0-1) */
  failureRate?: number;
  /** ヘルスチェックの状態 */
  healthy?: boolean;
  /** デフォルトの信頼度 */
  defaultConfidence?: number;
  /** ストリーミング時のチャンク間隔（ミリ秒） */
  streamingIntervalMs?: number;
}

/**
 * テスト用のSTTモックアダプタ
 */
export class MockSTTAdapter implements STTPort {
  private readonly config: Required<MockSTTConfig>;
  private readonly sampleTranscripts = [
    'これは配信のテスト音声です。今日は新しい機能について説明します。',
    'みなさん、こんにちは！今日も配信を見てくれてありがとうございます。',
    'それでは次のトピックに移りましょう。何か質問はありますか？',
    '今日のテーマはプログラミングの基礎についてです。',
    'チャットでコメントお待ちしています！'
  ];

  constructor(config: MockSTTConfig = {}) {
    this.config = {
      failureRate: config.failureRate ?? 0,
      healthy: config.healthy ?? true,
      defaultConfidence: config.defaultConfidence ?? 0.95,
      streamingIntervalMs: config.streamingIntervalMs ?? 500
    };
  }

  async transcribe(audio: Buffer): Promise<STTResult> {
    // 失敗シミュレーション
    if (Math.random() < this.config.failureRate) {
      throw new STTError(
        'Mock STT service failure',
        'MOCK_STT_ERROR',
        true
      );
    }

    // 空のバッファチェック
    if (audio.length === 0) {
      throw new STTError(
        'Empty audio buffer',
        'EMPTY_AUDIO',
        false
      );
    }

    // ランダムなサンプルトランスクリプトを返す
    const transcript = this.sampleTranscripts[
      Math.floor(Math.random() * this.sampleTranscripts.length)
    ] ?? this.sampleTranscripts[0] ?? 'デフォルトトランスクリプト';

    return {
      transcript,
      confidence: this.config.defaultConfidence,
      language: 'ja',
      timestamp: Date.now()
    };
  }

  startStreaming(): Writable & Readable {
    const transform = new Transform({
      objectMode: true,
      transform: (chunk: Buffer, encoding, callback) => {
        // 失敗シミュレーション
        if (Math.random() < this.config.failureRate) {
          callback(new STTError(
            'Mock STT streaming failure',
            'MOCK_STT_STREAM_ERROR',
            true
          ));
          return;
        }

        // チャンクごとにランダムなトランスクリプトを生成
        const partialTranscripts = [
          'これは',
          '配信の',
          'テスト音声です',
          '今日は',
          '新しい機能について',
          '説明します'
        ];

        const transcript = partialTranscripts[
          Math.floor(Math.random() * partialTranscripts.length)
        ] ?? partialTranscripts[0] ?? 'チャンク';

        const result: STTResult = {
          transcript,
          confidence: this.config.defaultConfidence * 0.9, // ストリーミングは少し低い信頼度
          language: 'ja',
          timestamp: Date.now()
        };

        // 非同期でチャンクを送信
        setTimeout(() => {
          callback(null, result);
        }, this.config.streamingIntervalMs);
      }
    });

    return transform;
  }

  async isHealthy(): Promise<boolean> {
    return this.config.healthy;
  }
}
