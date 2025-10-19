import { Transform } from 'stream';

/**
 * STT変換結果
 */
export interface STTResult {
  /** 認識されたテキスト */
  transcript: string;
  /** 信頼度スコア (0-1) */
  confidence: number;
  /** セグメント情報 */
  segments: Array<{
    text: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>;
  /** 最終結果かどうか（ストリーミング時） */
  isFinal?: boolean;
  /** タイムスタンプ（UNIX時間） */
  timestamp: number;
  /** プロバイダー名 */
  provider: string;
  /** 検出された言語 */
  language?: string;
}

/**
 * STTエラー
 */
export class STTError extends Error {
  constructor(
    message: string,
    public readonly isRetryable: boolean,
    public readonly provider: string,
    public readonly originalError?: Error
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
   * @param options オプション設定
   * @returns 変換結果
   * @throws STTError
   */
  transcribe(audio: Buffer, options?: any): Promise<STTResult>;

  /**
   * ストリーミングモードで音声をテキストに変換
   * @param transform 変換ストリーム
   * @returns 同じ変換ストリーム
   */
  startStreaming(transform: Transform): Promise<Transform>;

  /**
   * ヘルスチェック
   * @returns サービスが利用可能かどうか
   */
  isHealthy(): Promise<boolean>;
}
