/**
 * YouTube Live Chatメッセージ
 */
export interface LiveChatMessage {
  /** メッセージID */
  id: string;
  /** メッセージ詳細 */
  snippet: {
    /** ライブチャットID */
    liveChatId: string;
    /** 投稿日時 */
    publishedAt: string;
    /** テキストメッセージ詳細 */
    textMessageDetails: {
      /** メッセージ本文 */
      messageText: string;
    };
    /** 投稿者情報 */
    authorDetails?: {
      channelId: string;
      displayName: string;
      profileImageUrl: string;
    };
  };
}

/**
 * レート制限情報
 */
export interface RateLimitInfo {
  /** 制限数（30秒あたりのメッセージ数） */
  limit: number;
  /** 残り投稿可能数 */
  remaining: number;
  /** リセット時刻 */
  resetAt: Date;
  /** 再試行までの秒数（レート制限時のみ） */
  retryAfter?: number;
}

/**
 * YouTubeエラー
 */
export class YouTubeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true,
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = 'YouTubeError';
  }
}

/**
 * YouTubeポートインターフェース
 */
export interface YouTubePort {
  /**
   * ライブチャットにメッセージを投稿
   * @param liveChatId ライブチャットID
   * @param message メッセージ本文（最大200文字）
   * @returns 投稿されたメッセージ
   * @throws YouTubeError
   */
  postMessage(liveChatId: string, message: string): Promise<LiveChatMessage>;

  /**
   * 動画IDからライブチャットIDを取得
   * @param videoId YouTube動画ID
   * @returns ライブチャットID
   * @throws YouTubeError ライブ配信でない場合
   */
  getLiveChatId(videoId: string): Promise<string>;

  /**
   * 現在のレート制限情報を取得
   * @returns レート制限情報
   */
  getRateLimitInfo(): Promise<RateLimitInfo>;

  /**
   * ヘルスチェック
   * @returns サービスが利用可能かどうか
   */
  isHealthy(): Promise<boolean>;
}
