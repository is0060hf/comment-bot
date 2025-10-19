/**
 * YouTube Live Chat サービス
 * ライブ配信のチャットIDを取得・管理する
 */

import { youtube_v3 } from 'googleapis';

export interface LiveChatConfig {
  youtube: youtube_v3.Youtube;
  cacheTTL?: number; // キャッシュの有効期限（ミリ秒）
}

interface CacheEntry {
  chatId: string;
  timestamp: number;
}

export class LiveChatService {
  private youtube: youtube_v3.Youtube;
  private cacheTTL: number;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(config: LiveChatConfig) {
    this.youtube = config.youtube;
    this.cacheTTL = config.cacheTTL || 300000; // デフォルト5分
  }

  /**
   * 動画IDからLive Chat IDを取得
   */
  async getLiveChatId(videoId: string): Promise<string> {
    // 入力検証
    if (!videoId || typeof videoId !== 'string' || !videoId.trim()) {
      throw new Error('Invalid video ID');
    }

    const trimmedId = videoId.trim();

    // キャッシュを確認
    const cached = this.cache.get(trimmedId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.chatId;
    }

    try {
      // YouTube APIを呼び出し
      const response = await this.youtube.videos.list({
        part: ['liveStreamingDetails'],
        id: [trimmedId],
      });

      const items = response.data.items;
      if (!items || items.length === 0) {
        throw new Error('Video not found');
      }

      const video = items[0];
      if (!video) {
        throw new Error('Video not found');
      }
      const liveChatId = video.liveStreamingDetails?.activeLiveChatId;

      if (!liveChatId) {
        throw new Error('No active live chat found for video');
      }

      // キャッシュに保存
      this.cache.set(trimmedId, {
        chatId: liveChatId,
        timestamp: Date.now(),
      });

      return liveChatId;
    } catch (error: any) {
      // YouTube APIエラーをそのまま投げる
      throw error;
    }
  }

  /**
   * アクティブなライブ配信を取得
   */
  async getActiveLiveBroadcast(): Promise<youtube_v3.Schema$LiveBroadcast | null> {
    try {
      const response = await this.youtube.liveBroadcasts.list({
        part: ['snippet', 'status'],
        broadcastStatus: 'active',
        mine: true,
      });

      const items = response.data.items;
      if (!items || items.length === 0) {
        return null;
      }

      // 最初のアクティブな配信を返す
      return items[0] || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 動画URLからIDを抽出
   */
  extractVideoId(url: string): string | null {
    if (!url) {
      return null;
    }

    // YouTube URLのパターン
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    // URLではなく、すでにIDの場合
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }

    return null;
  }

  // _cleanupCache メソッドは現在使用されていないため削除
  // 将来的にキャッシュ管理が必要になった場合は再実装する
}
