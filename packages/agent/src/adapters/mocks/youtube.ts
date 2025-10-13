import {
  YouTubePort,
  LiveChatMessage,
  YouTubeError,
  RateLimitInfo
} from '../../ports/youtube';

/**
 * MockYouTubeアダプタの設定
 */
export interface MockYouTubeConfig {
  /** 失敗率 (0-1) */
  failureRate?: number;
  /** ヘルスチェックの状態 */
  healthy?: boolean;
  /** レート制限超過状態 */
  rateLimitExceeded?: boolean;
  /** ライブ配信中かどうか */
  isLive?: boolean;
  /** レート制限ウィンドウ（ミリ秒） */
  rateLimitWindowMs?: number;
  /** レート制限数 */
  rateLimitMax?: number;
}

/**
 * テスト用のYouTubeモックアダプタ
 */
export class MockYouTubeAdapter implements YouTubePort {
  private readonly config: Required<MockYouTubeConfig>;
  private messageHistory: { timestamp: number; messageId: string }[] = [];
  private messageCounter = 0;

  constructor(config: MockYouTubeConfig = {}) {
    this.config = {
      failureRate: config.failureRate ?? 0,
      healthy: config.healthy ?? true,
      rateLimitExceeded: config.rateLimitExceeded ?? false,
      isLive: config.isLive ?? true,
      rateLimitWindowMs: config.rateLimitWindowMs ?? 30000, // 30秒
      rateLimitMax: config.rateLimitMax ?? 30
    };
  }

  async postMessage(liveChatId: string, message: string): Promise<LiveChatMessage> {
    // 失敗シミュレーション
    if (Math.random() < this.config.failureRate) {
      throw new YouTubeError(
        'Mock YouTube API failure',
        'MOCK_YOUTUBE_ERROR',
        true,
        500
      );
    }

    // レート制限チェック
    this.cleanupOldMessages();
    if (this.config.rateLimitExceeded || this.messageHistory.length >= this.config.rateLimitMax) {
      throw new YouTubeError(
        'Rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        true,
        429
      );
    }

    // 文字数制限チェック（200文字）
    if (message.length > 200) {
      throw new YouTubeError(
        'Message too long (max 200 characters)',
        'MESSAGE_TOO_LONG',
        false,
        400
      );
    }

    // メッセージを記録
    const messageId = `mock-message-${++this.messageCounter}`;
    const timestamp = Date.now();
    this.messageHistory.push({ timestamp, messageId });

    // モックレスポンスを返す
    return {
      id: messageId,
      snippet: {
        liveChatId,
        publishedAt: new Date(timestamp).toISOString(),
        textMessageDetails: {
          messageText: message
        },
        authorDetails: {
          channelId: 'mock-channel-id',
          displayName: 'Comment Bot',
          profileImageUrl: 'https://example.com/avatar.png'
        }
      }
    };
  }

  async getLiveChatId(videoId: string): Promise<string> {
    // 失敗シミュレーション
    if (Math.random() < this.config.failureRate) {
      throw new YouTubeError(
        'Mock YouTube API failure',
        'MOCK_YOUTUBE_ERROR',
        true,
        500
      );
    }

    // ライブ配信チェック
    if (!this.config.isLive) {
      throw new YouTubeError(
        'Video is not a live stream',
        'NOT_LIVE_STREAM',
        false,
        400
      );
    }

    return `mock-live-chat-${videoId}`;
  }

  async getRateLimitInfo(): Promise<RateLimitInfo> {
    this.cleanupOldMessages();

    const now = Date.now();
    const resetAt = new Date(now + this.config.rateLimitWindowMs);
    const remaining = this.config.rateLimitExceeded 
      ? 0 
      : Math.max(0, this.config.rateLimitMax - this.messageHistory.length);

    const info: RateLimitInfo = {
      limit: this.config.rateLimitMax,
      remaining,
      resetAt
    };

    // レート制限超過時は再試行時間を設定
    if (this.config.rateLimitExceeded || remaining === 0) {
      info.retryAfter = Math.ceil(this.config.rateLimitWindowMs / 1000);
    }

    return info;
  }

  async isHealthy(): Promise<boolean> {
    return this.config.healthy;
  }

  /**
   * 古いメッセージ履歴をクリーンアップ
   */
  private cleanupOldMessages(): void {
    const now = Date.now();
    const cutoff = now - this.config.rateLimitWindowMs;
    this.messageHistory = this.messageHistory.filter(msg => msg.timestamp > cutoff);
  }
}
