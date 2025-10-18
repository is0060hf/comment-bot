/**
 * LLMメッセージロール
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * LLMメッセージ
 */
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

/**
 * コメント生成コンテキスト
 */
export interface CommentGenerationContext {
  /** 最近の話題（キーワード） */
  recentTopics: string[];
  /** 重要キーワード */
  keywords: string[];
  /** 配信タイトル */
  streamTitle: string;
  /** コメントポリシー */
  policy: {
    /** 口調 */
    tone: string;
    /** キャラクター設定 */
    characterPersona: string;
    /** 推奨表現 */
    encouragedExpressions: string[];
    /** 目標文字数 */
    targetLength: {
      min: number;
      max: number;
    };
  };
}

/**
 * コメント生成結果
 */
export interface CommentGenerationResult {
  /** 生成されたコメント */
  comment: string;
  /** 信頼度スコア (0-1) */
  confidence: number;
}

/**
 * コメント機会の分類
 */
export type CommentClassification = 'necessary' | 'unnecessary' | 'hold';

/**
 * コメント機会判定コンテキスト
 */
export interface CommentOpportunityContext {
  /** 現在の文字起こしテキスト */
  transcript: string;
  /** 最近の話題 */
  recentTopics: string[];
  /** エンゲージメントレベル (0-1) */
  engagementLevel: number;
}

/**
 * コメント機会判定結果
 */
export interface CommentClassificationResult {
  /** 分類結果 */
  classification: CommentClassification;
  /** 信頼度スコア (0-1) */
  confidence: number;
  /** 判定理由（オプション） */
  reason?: string;
}

/**
 * トークン使用量
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * チャット結果
 */
export interface ChatResult {
  message: LLMMessage;
  usage: TokenUsage;
}

/**
 * LLMエラー
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * LLMポートインターフェース
 */
export interface LLMPort {
  /**
   * コメントを生成
   * @param context 生成コンテキスト
   * @returns 生成結果
   * @throws LLMError
   */
  generateComment(context: CommentGenerationContext): Promise<CommentGenerationResult>;

  /**
   * コメント機会を判定
   * @param context 判定コンテキスト
   * @returns 判定結果
   * @throws LLMError
   */
  classifyCommentOpportunity(
    context: CommentOpportunityContext
  ): Promise<CommentClassificationResult>;

  /**
   * 汎用チャット
   * @param messages メッセージ履歴
   * @param options オプション（temperature, maxTokensなど）
   * @returns チャット結果
   * @throws LLMError
   */
  chat(messages: LLMMessage[], options?: Record<string, unknown>): Promise<ChatResult>;

  /**
   * ヘルスチェック
   * @returns サービスが利用可能かどうか
   */
  isHealthy(): Promise<boolean>;
}
