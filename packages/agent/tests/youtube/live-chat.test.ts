/**
 * Tsumiki AITDD - Red Phase
 * タスク40: Live Chat ID取得機能のテストケース
 */

import { LiveChatService, LiveChatConfig } from '../../src/youtube/live-chat';
import { youtube_v3 } from 'googleapis';

// モック
jest.mock('googleapis');

describe('LiveChatService', () => {
  let service: LiveChatService;
  let mockYouTubeClient: any;
  let config: LiveChatConfig;

  beforeEach(() => {
    mockYouTubeClient = {
      liveBroadcasts: {
        list: jest.fn(),
      },
      videos: {
        list: jest.fn(),
      },
      liveChatMessages: {
        insert: jest.fn(),
        list: jest.fn(),
      },
    } as any;

    config = {
      youtube: mockYouTubeClient,
    };

    service = new LiveChatService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getLiveChatId from video', () => {
    test('動画IDからLive Chat IDを取得できること', async () => {
      const videoId = 'test-video-id';
      const expectedChatId = 'test-live-chat-id';

      mockYouTubeClient.videos.list.mockResolvedValue({
        data: {
          items: [
            {
              id: videoId,
              liveStreamingDetails: {
                activeLiveChatId: expectedChatId,
              },
            },
          ],
        },
      } as any);

      const chatId = await service.getLiveChatId(videoId);

      expect(mockYouTubeClient.videos.list).toHaveBeenCalledWith({
        part: ['liveStreamingDetails'],
        id: [videoId],
      });
      expect(chatId).toBe(expectedChatId);
    });

    test('ライブ配信でない動画の場合エラーになること', async () => {
      const videoId = 'non-live-video-id';

      mockYouTubeClient.videos.list.mockResolvedValue({
        data: {
          items: [
            {
              id: videoId,
              // liveStreamingDetailsがない
            },
          ],
        },
      } as any);

      await expect(service.getLiveChatId(videoId)).rejects.toThrow(
        'No active live chat found for video'
      );
    });

    test('存在しない動画IDの場合エラーになること', async () => {
      const videoId = 'non-existent-video-id';

      mockYouTubeClient.videos.list.mockResolvedValue({
        data: {
          items: [],
        },
      } as any);

      await expect(service.getLiveChatId(videoId)).rejects.toThrow(
        'Video not found'
      );
    });

    test('APIエラーをハンドリングできること', async () => {
      const videoId = 'test-video-id';

      mockYouTubeClient.videos.list.mockRejectedValue(
        new Error('YouTube API error')
      );

      await expect(service.getLiveChatId(videoId)).rejects.toThrow(
        'YouTube API error'
      );
    });
  });

  describe('getActiveLiveBroadcast', () => {
    test('アクティブなライブ配信を取得できること', async () => {
      const expectedBroadcast = {
        id: 'broadcast-id',
        snippet: {
          title: 'Test Live Stream',
          liveChatId: 'test-live-chat-id',
        },
        status: {
          lifeCycleStatus: 'live',
        },
      };

      mockYouTubeClient.liveBroadcasts.list.mockResolvedValue({
        data: {
          items: [expectedBroadcast],
        },
      } as any);

      const broadcast = await service.getActiveLiveBroadcast();

      expect(mockYouTubeClient.liveBroadcasts.list).toHaveBeenCalledWith({
        part: ['snippet', 'status'],
        broadcastStatus: 'active',
        mine: true,
      });
      expect(broadcast).toEqual(expectedBroadcast);
    });

    test('アクティブな配信がない場合nullを返すこと', async () => {
      mockYouTubeClient.liveBroadcasts.list.mockResolvedValue({
        data: {
          items: [],
        },
      } as any);

      const broadcast = await service.getActiveLiveBroadcast();

      expect(broadcast).toBeNull();
    });

    test('複数の配信がある場合最初のものを返すこと', async () => {
      const broadcasts = [
        {
          id: 'broadcast-1',
          snippet: { liveChatId: 'chat-1' },
          status: { lifeCycleStatus: 'live' },
        },
        {
          id: 'broadcast-2',
          snippet: { liveChatId: 'chat-2' },
          status: { lifeCycleStatus: 'live' },
        },
      ];

      mockYouTubeClient.liveBroadcasts.list.mockResolvedValue({
        data: {
          items: broadcasts,
        },
      } as any);

      const broadcast = await service.getActiveLiveBroadcast();

      expect(broadcast).toEqual(broadcasts[0]);
    });
  });

  describe('cache management', () => {
    test('Live Chat IDをキャッシュすること', async () => {
      const videoId = 'test-video-id';
      const chatId = 'test-live-chat-id';

      mockYouTubeClient.videos.list.mockResolvedValue({
        data: {
          items: [
            {
              id: videoId,
              liveStreamingDetails: {
                activeLiveChatId: chatId,
              },
            },
          ],
        },
      } as any);

      // 1回目の呼び出し
      const chatId1 = await service.getLiveChatId(videoId);
      expect(chatId1).toBe(chatId);

      // 2回目の呼び出し（キャッシュから）
      const chatId2 = await service.getLiveChatId(videoId);
      expect(chatId2).toBe(chatId);

      // APIは1回だけ呼ばれる
      expect(mockYouTubeClient.videos.list).toHaveBeenCalledTimes(1);
    });

    test('キャッシュをクリアできること', async () => {
      const videoId = 'test-video-id';
      const chatId = 'test-live-chat-id';

      mockYouTubeClient.videos.list.mockResolvedValue({
        data: {
          items: [
            {
              id: videoId,
              liveStreamingDetails: {
                activeLiveChatId: chatId,
              },
            },
          ],
        },
      } as any);

      // キャッシュに保存
      await service.getLiveChatId(videoId);

      // キャッシュをクリア
      service.clearCache();

      // 再度取得（APIが再度呼ばれる）
      await service.getLiveChatId(videoId);

      expect(mockYouTubeClient.videos.list).toHaveBeenCalledTimes(2);
    });

    test('キャッシュの有効期限が機能すること', async () => {
      // 短いTTLでサービスを作成
      const shortTTLService = new LiveChatService({
        youtube: mockYouTubeClient,
        cacheTTL: 100, // 100ms
      });

      const videoId = 'test-video-id';
      const chatId = 'test-live-chat-id';

      mockYouTubeClient.videos.list.mockResolvedValue({
        data: {
          items: [
            {
              id: videoId,
              liveStreamingDetails: {
                activeLiveChatId: chatId,
              },
            },
          ],
        },
      } as any);

      // 1回目の呼び出し
      await shortTTLService.getLiveChatId(videoId);

      // TTLより長く待つ
      await new Promise(resolve => setTimeout(resolve, 150));

      // 2回目の呼び出し（キャッシュ期限切れ）
      await shortTTLService.getLiveChatId(videoId);

      expect(mockYouTubeClient.videos.list).toHaveBeenCalledTimes(2);
    });
  });

  describe('validation', () => {
    test('無効な動画IDを検証できること', async () => {
      const invalidIds = ['', '   ', null, undefined];

      for (const id of invalidIds) {
        await expect(service.getLiveChatId(id as any)).rejects.toThrow(
          'Invalid video ID'
        );
      }
    });

    test('動画URLからIDを抽出できること', () => {
      const testCases = [
        {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          expectedId: 'dQw4w9WgXcQ',
        },
        {
          url: 'https://youtu.be/dQw4w9WgXcQ',
          expectedId: 'dQw4w9WgXcQ',
        },
        {
          url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          expectedId: 'dQw4w9WgXcQ',
        },
        {
          url: 'dQw4w9WgXcQ', // IDのみ
          expectedId: 'dQw4w9WgXcQ',
        },
      ];

      testCases.forEach(({ url, expectedId }) => {
        const id = service.extractVideoId(url);
        expect(id).toBe(expectedId);
      });
    });

    test('無効なURLからIDを抽出できないこと', () => {
      const invalidUrls = [
        'https://example.com',
        'not-a-url',
        '',
      ];

      invalidUrls.forEach(url => {
        const id = service.extractVideoId(url);
        expect(id).toBeNull();
      });
    });
  });
});
