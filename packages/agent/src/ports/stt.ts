import { Readable, Writable } from 'stream';

/**
 * STT変換結果
 */
export interface STTResult {
  /** 認識されたテキスト */
  transcript: string;
  /** 信頼度スコア (0-1) */
  confidence: number;
  /** 検出された言語 */
  language: string;
  /** タイムスタンプ（UNIX時間） */
  timestamp: number;
}

/**
 * STTエラー
 */
export class STTError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'STTError';
  }
}

/**
 * STTポートインターフェース
 */
export interface STTPort {
  /**
   * 音声データをテキストに変換
   * @param audio 音声データバッファ
   * @returns 変換結果
   * @throws STTError
   */
  transcribe(audio: Buffer): Promise<STTResult>;

  /**
   * ストリーミングモードで音声をテキストに変換
   * @returns 書き込み可能なストリーム（音声入力）と読み取り可能なストリーム（テキスト出力）
   */
  startStreaming(): Writable & Readable;

  /**
   * ヘルスチェック
   * @returns サービスが利用可能かどうか
   */
  isHealthy(): Promise<boolean>;
}
