/**
 * モデレーションカテゴリ
 */
export type ModerationCategory = 
  | 'hate'
  | 'harassment'
  | 'self-harm'
  | 'sexual'
  | 'violence'
  | 'illegal'
  | 'graphic';

/**
 * モデレーション結果
 */
export interface ModerationResult {
  /** フラグ済み（不適切）かどうか */
  flagged: boolean;
  /** カテゴリ別のフラグ */
  categories: Partial<Record<ModerationCategory, boolean>>;
  /** カテゴリ別のスコア (0-1) */
  scores: Partial<Record<ModerationCategory, number>>;
  /** フラグされたカテゴリ（内部使用） */
  flaggedCategories?: string[];
  /** リライトが必要かどうか */
  requiresRewrite?: boolean;
  /** 推奨アクション */
  suggestedAction?: 'block' | 'rewrite' | 'pass';
  /** エラー情報 */
  error?: string;
}

/**
 * リライト結果
 */
export interface RewriteResult {
  /** リライト成功かどうか */
  rewritten: boolean;
  /** リライト後のコンテンツ */
  rewrittenContent?: string;
  /** 変更箇所数 */
  changes?: number;
  /** 変更理由 */
  reasons?: string[];
}

/**
 * モデレーションエラー
 */
export class ModerationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true
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
  moderate(content: string, context?: Record<string, unknown>): Promise<ModerationResult>;
  
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
   * @returns リライト結果
   * @throws ModerationError
   */
  rewriteContent(content: string, guidelines?: string[]): Promise<RewriteResult>;
  
  /**
   * ヘルスチェック
   * @returns サービスが利用可能かどうか
   */
  isHealthy(): Promise<boolean>;
}
