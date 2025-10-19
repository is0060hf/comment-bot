/**
 * YouTube アダプタ実装
 * YouTubePortインターフェースの実装
 */

import { youtube_v3 } from 'googleapis';
import { 
  YouTubePort, 
  LiveChatMessage, 
  RateLimitInfo, 
  YouTubeError 
} from '../ports/youtube';

export interface YouTubeAdapterConfig {
  youtube: youtube_v3.Youtube;
  maxRetries?: number;
  retryDelay?: number;
  rateLimitPerMinute?: number;
  deduplicationWindow?: number; // ミリ秒
}

interface RateLimitState {
  count: number;
  resetAt: Date;
}

export class YouTubeAdapter implements YouTubePort {
  private youtube: youtube_v3.Youtube;
  private config: YouTubeAdapterConfig;
  private rateLimitState: RateLimitState;
  private recentMessages: Map<string, number> = new Map(); // メッセージハッシュ -> タイムスタンプ

  constructor(config: YouTubeAdapterConfig) {
    this.youtube = config.youtube;
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      rateLimitPerMinute: 200,
      deduplicationWindow: 30000, // 30秒
      ...config,
    };

    // レート制限の初期化
    this.rateLimitState = {
      count: 0,
      resetAt: new Date(Date.now() + 60000),
    };

    // レート制限のリセットタイマー
    setInterval(() => {
      this.resetRateLimit();
    }, 60000);
  }

  /**
   * メッセージを投稿
   */
  async postMessage(liveChatId: string, message: string): Promise<LiveChatMessage> {
    // 入力検証
    this.validateMessage(message);

    // レート制限チェック
    this.checkRateLimit();

    // 重複チェック
    this.checkDuplication(liveChatId, message);

    // リトライ付きで投稿
    return this.postWithRetry(liveChatId, message);
  }

  /**
   * 動画IDからLive Chat IDを取得
   */
  async getLiveChatId(videoId: string): Promise<string> {
    try {
      const response = await this.youtube.videos.list({
        part: ['liveStreamingDetails'],
        id: [videoId],
      });

      const video = response.data.items?.[0];
      const chatId = video?.liveStreamingDetails?.activeLiveChatId;

      if (!chatId) {
        throw new YouTubeError(
          'No active live chat found',
          'NOT_FOUND',
          false
        );
      }

      return chatId;
    } catch (error: any) {
      throw this.handleApiError(error);
    }
  }

  /**
   * レート制限情報を取得
   */
  async getRateLimitInfo(): Promise<RateLimitInfo> {
    this.checkAndResetRateLimit();

    const remaining = Math.max(0, this.config.rateLimitPerMinute! - this.rateLimitState.count);
    const secondsUntilReset = Math.max(0, 
      Math.floor((this.rateLimitState.resetAt.getTime() - Date.now()) / 1000)
    );

    return {
      limit: this.config.rateLimitPerMinute!,
      remaining,
      resetAt: this.rateLimitState.resetAt,
      retryAfter: remaining === 0 ? secondsUntilReset : undefined,
    };
  }

  /**
   * ヘルスチェック
   */
  async isHealthy(): Promise<boolean> {
    try {
      // 簡単なAPIコールでチェック
      await this.youtube.videos.list({
        part: ['id'],
        id: ['dQw4w9WgXcQ'], // 既知の動画ID
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * メッセージの検証
   */
  private validateMessage(message: string): void {
    if (!message || !message.trim()) {
      throw new YouTubeError(
        'Message cannot be empty',
        'INVALID_MESSAGE',
        false
      );
    }

    if (message.length > 200) {
      throw new YouTubeError(
        'Message exceeds 200 characters limit',
        'MESSAGE_TOO_LONG',
        false
      );
    }
  }

  /**
   * レート制限のチェック
   */
  private checkRateLimit(): void {
    this.checkAndResetRateLimit();

    if (this.rateLimitState.count >= this.config.rateLimitPerMinute!) {
      const secondsUntilReset = Math.ceil(
        (this.rateLimitState.resetAt.getTime() - Date.now()) / 1000
      );

      throw new YouTubeError(
        `Rate limit exceeded. Retry after ${secondsUntilReset} seconds`,
        'RATE_LIMIT_EXCEEDED',
        true
      );
    }
  }

  /**
   * 重複チェック
   */
  private checkDuplication(liveChatId: string, message: string): void {
    const messageKey = `${liveChatId}:${message}`;
    const lastSent = this.recentMessages.get(messageKey);

    if (lastSent && Date.now() - lastSent < this.config.deduplicationWindow!) {
      throw new YouTubeError(
        'Duplicate message detected',
        'DUPLICATE_MESSAGE',
        false
      );
    }
  }

  /**
   * リトライ付き投稿
   */
  private async postWithRetry(
    liveChatId: string, 
    message: string
  ): Promise<LiveChatMessage> {
    let lastError: any;

    for (let i = 0; i < this.config.maxRetries!; i++) {
      try {
        const response = await this.youtube.liveChatMessages.insert({
          part: ['snippet'],
          requestBody: {
            snippet: {
              liveChatId,
              type: 'textMessageEvent',
              textMessageDetails: {
                messageText: message,
              },
            },
          },
        });

        // 成功したらレート制限カウントを増やす
        this.rateLimitState.count++;

        // 重複防止用に記録
        const messageKey = `${liveChatId}:${message}`;
        this.recentMessages.set(messageKey, Date.now());

        // 古い記録を削除
        this.cleanupRecentMessages();

        return response.data as LiveChatMessage;
      } catch (error: any) {
        lastError = error;

        // リトライ不可能なエラーの場合は即座に投げる
        const youtubeError = this.handleApiError(error);
        if (!youtubeError.retryable) {
          throw youtubeError;
        }

        // リトライ前に待機
        if (i < this.config.maxRetries! - 1) {
          await new Promise(resolve => 
            setTimeout(resolve, this.config.retryDelay! * (i + 1))
          );
        }
      }
    }

    throw this.handleApiError(lastError);
  }

  /**
   * APIエラーのハンドリング
   */
  private handleApiError(error: any): YouTubeError {
    // すでにYouTubeErrorの場合はそのまま返す
    if (error instanceof YouTubeError) {
      return error;
    }

    // YouTube APIエラーの場合
    if (error.code && error.errors) {
      const errorCode = error.code;
      const reason = error.errors[0]?.reason;

      switch (errorCode) {
        case 401:
          return new YouTubeError(
            'Authentication required',
            'UNAUTHORIZED',
            false
          );
        case 403:
          if (reason === 'rateLimitExceeded') {
            return new YouTubeError(
              'YouTube API rate limit exceeded',
              'RATE_LIMIT_EXCEEDED',
              true
            );
          }
          if (reason === 'liveChatBannedError') {
            return new YouTubeError(
              'User is banned from live chat',
              'USER_BANNED',
              false
            );
          }
          return new YouTubeError(
            'Access forbidden',
            'FORBIDDEN',
            false
          );
        case 404:
          return new YouTubeError(
            'Live chat not found',
            'NOT_FOUND',
            false
          );
        case 400:
          if (reason === 'liveChatDisabled') {
            return new YouTubeError(
              'Live chat is disabled',
              'LIVE_CHAT_DISABLED',
              false
            );
          }
          return new YouTubeError(
            'Invalid request',
            'INVALID_REQUEST',
            false
          );
        default:
          // ネットワークエラーなどはリトライ可能
          if (errorCode >= 500 || !errorCode) {
            return new YouTubeError(
              error.message || 'Unknown error',
              'UNKNOWN_ERROR',
              true
            );
          }
      }
    }

    // その他のエラー
    return new YouTubeError(
      error.message || 'Unknown error',
      'UNKNOWN_ERROR',
      true
    );
  }

  /**
   * レート制限のリセットチェック
   */
  private checkAndResetRateLimit(): void {
    if (Date.now() >= this.rateLimitState.resetAt.getTime()) {
      this.resetRateLimit();
    }
  }

  /**
   * レート制限のリセット
   */
  private resetRateLimit(): void {
    this.rateLimitState = {
      count: 0,
      resetAt: new Date(Date.now() + 60000),
    };
  }

  /**
   * 古い重複チェック記録を削除
   */
  private cleanupRecentMessages(): void {
    const cutoff = Date.now() - this.config.deduplicationWindow!;
    
    for (const [key, timestamp] of this.recentMessages.entries()) {
      if (timestamp < cutoff) {
        this.recentMessages.delete(key);
      }
    }
  }
}
