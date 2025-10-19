/**
 * モデレーションカテゴリ
 */
export enum ModerationCategory {
  HATE = 'hate',
  HARASSMENT = 'harassment',
  SELF_HARM = 'self-harm',
  SEXUAL = 'sexual',
  VIOLENCE = 'violence',
  ILLEGAL = 'illegal',
  GRAPHIC = 'graphic',
}

/**
 * モデレーション結果
 */
export interface ModerationResult {
  /** フラグ済み（不適切）かどうか */
  flagged: boolean;
  /** カテゴリ別のスコア (0-1) */
  scores: {
    hate: number;
    harassment: number;
    selfHarm: number;
    sexual: number;
    violence: number;
    illegal: number;
    graphic: number;
  };
  /** フラグされたカテゴリ */
  flaggedCategories: ModerationCategory[];
  /** 推奨アクション */
  suggestedAction?: 'approve' | 'review' | 'block' | 'rewrite';
  /** エラー情報 */
  error?: string;
  /** プロバイダー名 */
  provider?: string;
}

/**
 * リライト結果
 */
export interface RewriteResult {
  /** 元のコンテンツ */
  original: string;
  /** リライト後のコンテンツ */
  rewritten: string;
  /** リライトされたかどうか */
  wasRewritten: boolean;
}

/**
 * モデレーションエラー
 */
export class ModerationError extends Error {
  constructor(
    message: string,
    public readonly isRetryable: boolean,
    public readonly provider: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ModerationError';
  }
}

/**
 * モデレーションポートインターフェース
 */
export interface ModerationPort {
  /**
   * コンテンツをモデレート
   * @param content モデレート対象のコンテンツ
   * @param context オプションのコンテキスト情報
   * @returns モデレーション結果
   * @throws ModerationError
   */
  moderate(content: string, context?: string): Promise<ModerationResult>;

  /**
   * 複数のコンテンツを一括モデレート
   * @param contents モデレート対象のコンテンツ配列
   * @returns モデレーション結果配列
   * @throws ModerationError
   */
  moderateBatch(contents: string[]): Promise<ModerationResult[]>;

  /**
   * 不適切なコンテンツをリライト
   * @param content リライト対象のコンテンツ
   * @param guidelines リライトガイドライン
   * @param context オプションのコンテキスト情報
   * @returns リライト結果
   * @throws ModerationError
   */
  rewriteContent(content: string, guidelines: string, context?: string): Promise<RewriteResult>;

  /**
   * ヘルスチェック
   * @returns サービスが利用可能かどうか
   */
  isHealthy(): Promise<boolean>;
}
