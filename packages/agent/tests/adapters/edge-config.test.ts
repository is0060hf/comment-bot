/**
 * Tsumiki AITDD - Red Phase
 * タスク42: Edge Configクライアントのテストケース
 */

import { EdgeConfigClient, EdgeConfigOptions } from '../../src/adapters/edge-config';

// @vercel/edge-config のモック（手動モック）
const mockEdgeConfig = {
  get: jest.fn(),
  getAll: jest.fn(),
  has: jest.fn(),
};

// requireをモック
jest.doMock('@vercel/edge-config', () => mockEdgeConfig, { virtual: true });

describe('EdgeConfigClient', () => {
  let client: EdgeConfigClient;

  beforeEach(() => {
    jest.clearAllMocks();

    const options: EdgeConfigOptions = {
      connectionString: 'https://edge-config.vercel.com/test-config',
      cacheTime: 5000, // 5秒
    };

    client = new EdgeConfigClient(options);
  });

  describe('initialization', () => {
    test('接続文字列なしでも初期化できること', () => {
      const clientWithoutConnection = new EdgeConfigClient({});
      expect(clientWithoutConnection.isEnabled()).toBe(false);
    });

    test('環境変数から接続文字列を読み込めること', () => {
      process.env.EDGE_CONFIG = 'https://edge-config.vercel.com/env-config';
      
      const clientFromEnv = new EdgeConfigClient({});
      expect(clientFromEnv.isEnabled()).toBe(true);
      
      delete process.env.EDGE_CONFIG;
    });
  });

  describe('get', () => {
    test('設定値を取得できること', async () => {
      const expectedConfig = {
        comment: {
          tone: 'casual',
          maxLength: 50,
        },
      };

      mockEdgeConfig.get.mockResolvedValue(expectedConfig);

      const result = await client.get('comment-bot-config');

      expect(result).toEqual(expectedConfig);
      expect(mockEdgeConfig.get).toHaveBeenCalledWith('comment-bot-config');
    });

    test('存在しないキーはnullを返すこと', async () => {
      mockEdgeConfig.get.mockResolvedValue(null);

      const result = await client.get('non-existent-key');

      expect(result).toBeNull();
    });

    test('エラー時は例外を投げること', async () => {
      mockEdgeConfig.get.mockRejectedValue(new Error('Network error'));

      await expect(client.get('comment-bot-config')).rejects.toThrow('Network error');
    });

    test('キャッシュが機能すること', async () => {
      const expectedConfig = { comment: { tone: 'casual' } };
      mockEdgeConfig.get.mockResolvedValue(expectedConfig);

      // 初回取得
      await client.get('comment-bot-config');
      
      // 2回目取得（キャッシュから）
      await client.get('comment-bot-config');

      // Edge Configは1回だけ呼ばれる
      expect(mockEdgeConfig.get).toHaveBeenCalledTimes(1);
    });

    test('キャッシュが期限切れ後に再取得されること', async () => {
      jest.useFakeTimers();

      const config1 = { comment: { tone: 'casual' } };
      const config2 = { comment: { tone: 'friendly' } };
      
      mockEdgeConfig.get
        .mockResolvedValueOnce(config1)
        .mockResolvedValueOnce(config2);

      // 初回取得
      const result1 = await client.get('comment-bot-config');
      expect(result1).toEqual(config1);

      // 5秒後（キャッシュ期限切れ）
      jest.advanceTimersByTime(6000);

      // 2回目取得（新しい値）
      const result2 = await client.get('comment-bot-config');
      expect(result2).toEqual(config2);

      expect(mockEdgeConfig.get).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('getAll', () => {
    test('すべての設定を取得できること', async () => {
      const allConfigs = {
        'comment-bot-config': { comment: { tone: 'casual' } },
        'other-config': { feature: 'enabled' },
      };

      mockEdgeConfig.getAll.mockResolvedValue(allConfigs);

      const result = await client.getAll();

      expect(result).toEqual(allConfigs);
      expect(mockEdgeConfig.getAll).toHaveBeenCalled();
    });

    test('getAllもキャッシュされること', async () => {
      const allConfigs = { config1: {}, config2: {} };
      mockEdgeConfig.getAll.mockResolvedValue(allConfigs);

      await client.getAll();
      await client.getAll();

      expect(mockEdgeConfig.getAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('has', () => {
    test('キーの存在を確認できること', async () => {
      mockEdgeConfig.has.mockResolvedValue(true);

      const result = await client.has('comment-bot-config');

      expect(result).toBe(true);
      expect(mockEdgeConfig.has).toHaveBeenCalledWith('comment-bot-config');
    });

    test('存在しないキーはfalseを返すこと', async () => {
      mockEdgeConfig.has.mockResolvedValue(false);

      const result = await client.has('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('cache management', () => {
    test('キャッシュをクリアできること', async () => {
      const config = { comment: { tone: 'casual' } };
      mockEdgeConfig.get.mockResolvedValue(config);

      // キャッシュに保存
      await client.get('comment-bot-config');
      
      // キャッシュクリア
      client.clearCache();

      // 再取得（Edge Configが再度呼ばれる）
      await client.get('comment-bot-config');

      expect(mockEdgeConfig.get).toHaveBeenCalledTimes(2);
    });

    test('特定のキーのキャッシュのみクリアできること', async () => {
      const config1 = { comment: { tone: 'casual' } };
      const config2 = { safety: { level: 'high' } };
      
      mockEdgeConfig.get
        .mockResolvedValueOnce(config1)
        .mockResolvedValueOnce(config2)
        .mockResolvedValueOnce(config1);

      // 2つの設定をキャッシュ
      await client.get('config1');
      await client.get('config2');

      // config1のキャッシュのみクリア
      client.clearCache('config1');

      // config1は再取得、config2はキャッシュから
      await client.get('config1');
      await client.get('config2');

      expect(mockEdgeConfig.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    test('接続エラーを適切にハンドリングすること', async () => {
      mockEdgeConfig.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      try {
        await client.get('comment-bot-config');
      } catch (error) {
        // エラーは投げられる
      }

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'ECONNREFUSED',
        })
      );
    });

    test('リトライ機能が動作すること', async () => {
      const config = { comment: { tone: 'casual' } };
      
      mockEdgeConfig.get
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(config);

      const clientWithRetry = new EdgeConfigClient({
        connectionString: 'test',
        retryAttempts: 2,
        retryDelay: 100,
      });

      const result = await clientWithRetry.get('comment-bot-config');

      expect(result).toEqual(config);
      expect(mockEdgeConfig.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('sanitization', () => {
    test('シークレット情報が除外されること', async () => {
      const configWithSecrets = {
        comment: { tone: 'casual' },
        youtube: {
          clientId: 'should-be-removed',
          clientSecret: 'should-be-removed',
          refreshToken: 'should-be-removed',
        },
        providers: {
          apiKeys: {
            openai: 'should-be-removed',
            deepgram: 'should-be-removed',
          },
        },
      };

      mockEdgeConfig.get.mockResolvedValue(configWithSecrets);

      const result = await client.get('comment-bot-config');

      // シークレットは除外される
      expect(result.youtube).toBeUndefined();
      expect(result.providers?.apiKeys).toBeUndefined();
      expect(result.comment).toEqual({ tone: 'casual' });
    });

    test('sanitizeオプションで除外を無効化できること', async () => {
      const configWithSecrets = {
        youtube: { clientId: 'test-id' },
      };

      mockEdgeConfig.get.mockResolvedValue(configWithSecrets);

      const clientNoSanitize = new EdgeConfigClient({
        connectionString: 'test',
        sanitize: false,
      });

      const result = await clientNoSanitize.get('comment-bot-config');

      // シークレットが保持される（本番では使用しない）
      expect(result.youtube?.clientId).toBe('test-id');
    });
  });
});
