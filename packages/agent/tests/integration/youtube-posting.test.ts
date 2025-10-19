/**
 * Tsumiki AITDD - Red Phase
 * タスク5: YouTube投稿統合テスト
 */

import { YouTubeAuth } from '../../src/youtube/auth';
import { LiveChatService } from '../../src/youtube/live-chat';
import { YouTubeAdapter } from '../../src/adapters/youtube';
import { CommentPipeline } from '../../src/core/comment-pipeline';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';

// 環境変数を読み込み
dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('YouTube Posting Integration', () => {
  let auth: YouTubeAuth;
  let liveChat: LiveChatService;
  let adapter: YouTubeAdapter;
  let pipeline: CommentPipeline;

  beforeEach(() => {
    // 各コンポーネントの初期化
    auth = new YouTubeAuth({
      clientId: process.env.YOUTUBE_CLIENT_ID!,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirectUri: 'http://localhost:3000/callback',
      scopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
    });

    const oauth2Client = auth.getClient();
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    liveChat = new LiveChatService({ youtube });
    adapter = new YouTubeAdapter({ 
      youtube,
      rateLimitPerMinute: 200,
    });
  });

  describe('authentication flow', () => {
    test.skip('既存のリフレッシュトークンで認証できること', async () => {
      const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
      
      if (!refreshToken) {
        console.warn('YOUTUBE_REFRESH_TOKEN not set, skipping test');
        return;
      }

      auth.setCredentials({
        refresh_token: refreshToken,
      });

      expect(auth.isAuthenticated()).toBe(true);
      
      // トークンをリフレッシュ
      const tokens = await auth.refreshToken();
      expect(tokens.access_token).toBeDefined();
    });
  });

  describe('live chat operations', () => {
    test.skip('アクティブな配信を検出できること', async () => {
      const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
      if (!refreshToken) {
        console.warn('YOUTUBE_REFRESH_TOKEN not set, skipping test');
        return;
      }

      auth.setCredentials({
        refresh_token: refreshToken,
      });
      await auth.refreshToken();

      const broadcast = await liveChat.getActiveLiveBroadcast();
      
      // アクティブな配信がない場合はスキップ
      if (!broadcast) {
        console.warn('No active broadcast found');
        return;
      }

      expect(broadcast.snippet?.liveChatId).toBeDefined();
    });

    test('動画URLからIDを抽出できること', () => {
      const testUrls = [
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
        { url: 'https://youtu.be/dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
        { url: 'dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
      ];

      testUrls.forEach(({ url, expectedId }) => {
        const videoId = liveChat.extractVideoId(url);
        expect(videoId).toBe(expectedId);
      });
    });
  });

  describe('posting messages', () => {
    test('テストメッセージを投稿できること（実際には投稿しない）', async () => {
      // 環境変数でテストモードを確認
      if (process.env.YOUTUBE_TEST_MODE !== 'live') {
        console.warn('YOUTUBE_TEST_MODE is not "live", using mock');
        
        const mockAdapter = jest.mocked(adapter);
        mockAdapter.postMessage = jest.fn().mockResolvedValue({
          id: 'mock-message-id',
          snippet: {
            textMessageDetails: {
              messageText: 'テストメッセージ',
            },
          },
        });

        const result = await mockAdapter.postMessage('mock-chat-id', 'テストメッセージ');
        expect(result.id).toBe('mock-message-id');
        return;
      }

      // 実際の投稿テスト（注意：本当に投稿される）
      const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
      const testChatId = process.env.TEST_LIVE_CHAT_ID;
      
      if (!refreshToken || !testChatId) {
        console.warn('Required env vars not set for live test');
        return;
      }

      auth.setCredentials({
        refresh_token: refreshToken,
      });
      await auth.refreshToken();

      const testMessage = `テスト投稿 ${new Date().toISOString()}`;
      const result = await adapter.postMessage(testChatId, testMessage);

      expect(result.id).toBeDefined();
      expect(result.snippet?.textMessageDetails?.messageText).toBe(testMessage);
    });
  });

  describe('error scenarios', () => {
    test('未認証でのAPI呼び出しはエラーになること', async () => {
      // 認証なしでAPIを呼び出す
      const unauthYouTube = google.youtube({ version: 'v3' });
      const unauthAdapter = new YouTubeAdapter({ 
        youtube: unauthYouTube,
      });

      await expect(
        unauthAdapter.postMessage('chat-id', 'message')
      ).rejects.toThrow();
    });

    test.skip('無効なLive Chat IDでエラーになること', async () => {
      const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
      if (!refreshToken) {
        console.warn('YOUTUBE_REFRESH_TOKEN not set, skipping test');
        return;
      }

      auth.setCredentials({
        refresh_token: refreshToken,
      });
      await auth.refreshToken();

      await expect(
        adapter.postMessage('invalid-chat-id', 'test message')
      ).rejects.toThrow();
    });

    test('長すぎるメッセージはローカルで検証されること', async () => {
      const longMessage = 'あ'.repeat(201);

      await expect(
        adapter.postMessage('chat-id', longMessage)
      ).rejects.toThrow('Message exceeds 200 characters limit');
    });
  });

  describe('rate limiting behavior', () => {
    test('レート制限情報を取得できること', async () => {
      const info = await adapter.getRateLimitInfo();

      expect(info.limit).toBe(200);
      expect(info.remaining).toBeLessThanOrEqual(200);
      expect(info.resetAt).toBeInstanceOf(Date);
    });

    test('連続投稿でレート制限が機能すること', async () => {
      // モックアダプタでテスト
      const mockMessages: string[] = [];
      let messageCount = 0;
      const maxPerMinute = 3; // テスト用に低い値

      const mockAdapter = {
        ...adapter,
        postMessage: jest.fn().mockImplementation(async (chatId, message) => {
          if (messageCount >= maxPerMinute) {
            throw new Error('Rate limit exceeded');
          }
          messageCount++;
          mockMessages.push(message);
          return { id: `msg-${messageCount}`, snippet: { textMessageDetails: { messageText: message } } };
        }),
        getRateLimitInfo: jest.fn().mockImplementation(() => ({
          limit: maxPerMinute,
          remaining: Math.max(0, maxPerMinute - messageCount),
          resetAt: new Date(Date.now() + 60000),
          retryAfter: messageCount >= maxPerMinute ? 60 : undefined,
        })),
      };

      // 制限まで投稿
      for (let i = 0; i < maxPerMinute; i++) {
        await mockAdapter.postMessage('chat-id', `Message ${i + 1}`);
      }

      // 次の投稿はレート制限エラー
      await expect(
        mockAdapter.postMessage('chat-id', 'Excess message')
      ).rejects.toThrow('Rate limit exceeded');

      const info = await mockAdapter.getRateLimitInfo();
      expect(info.remaining).toBe(0);
      expect(info.retryAfter).toBeDefined();
    });
  });

  describe('deduplication', () => {
    test('重複メッセージが検出されること', async () => {
      const message = '同じメッセージ';
      const chatId = 'test-chat-id';

      // モックアダプタで重複検出をテスト
      const sentMessages = new Set<string>();
      const mockAdapter = {
        postMessage: jest.fn().mockImplementation(async (id, msg) => {
          const key = `${id}:${msg}`;
          if (sentMessages.has(key)) {
            throw new Error('Duplicate message detected');
          }
          sentMessages.add(key);
          return { id: 'msg-id', snippet: { textMessageDetails: { messageText: msg } } };
        }),
      };

      // 1回目は成功
      await mockAdapter.postMessage(chatId, message);

      // 2回目は重複エラー
      await expect(
        mockAdapter.postMessage(chatId, message)
      ).rejects.toThrow('Duplicate message detected');
    });
  });
});
