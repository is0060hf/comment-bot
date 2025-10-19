/**
 * Tsumiki AITDD - Red Phase
 * Vercel Edge Config/KV連携のテスト
 */

import { EdgeConfigClient } from '../../src/lib/edge-config-client';
import { KVStore } from '../../src/lib/kv-store';
import { ConfigSync } from '../../src/lib/config-sync';

// Vercel Edge Config/KVのモック
jest.mock('@vercel/edge-config', () => ({
  get: jest.fn(),
  has: jest.fn(),
  getAll: jest.fn(),
}));

jest.mock('@vercel/kv', () => ({
  createClient: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    hdel: jest.fn(),
    hgetall: jest.fn(),
  })),
}));

describe('Vercel Edge Config/KV Integration', () => {
  describe('EdgeConfigClient', () => {
    const mockEdgeConfig = require('@vercel/edge-config');
    
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should get configuration from Edge Config', async () => {
      const mockConfig = {
        comment: {
          tone: 'friendly',
          targetLength: { min: 20, max: 100 },
        },
      };

      mockEdgeConfig.get.mockResolvedValue(mockConfig);

      const client = new EdgeConfigClient();
      const config = await client.getConfig('comment-bot-config');

      expect(config).toEqual(mockConfig);
      expect(mockEdgeConfig.get).toHaveBeenCalledWith('comment-bot-config');
    });

    it('should handle missing configuration', async () => {
      mockEdgeConfig.get.mockResolvedValue(null);

      const client = new EdgeConfigClient();
      const config = await client.getConfig('non-existent');

      expect(config).toBeNull();
    });

    it('should check if configuration exists', async () => {
      mockEdgeConfig.has.mockResolvedValue(true);

      const client = new EdgeConfigClient();
      const exists = await client.hasConfig('comment-bot-config');

      expect(exists).toBe(true);
      expect(mockEdgeConfig.has).toHaveBeenCalledWith('comment-bot-config');
    });

    it('should get all configurations', async () => {
      const allConfigs = {
        'comment-bot-config': { comment: { tone: 'friendly' } },
        'other-config': { foo: 'bar' },
      };

      mockEdgeConfig.getAll.mockResolvedValue(allConfigs);

      const client = new EdgeConfigClient();
      const configs = await client.getAllConfigs();

      expect(configs).toEqual(allConfigs);
    });

    it('should handle Edge Config errors', async () => {
      mockEdgeConfig.get.mockRejectedValue(new Error('Edge Config unavailable'));

      const client = new EdgeConfigClient();
      
      await expect(client.getConfig('comment-bot-config')).rejects.toThrow('Edge Config unavailable');
    });
  });

  describe('KVStore', () => {
    // KVStoreはVercel KVの実装に依存するため、
    // 実際の動作はE2Eテストで確認する
    it('should create KVStore instance', () => {
      const store = new KVStore();
      expect(store).toBeDefined();
    });

    it('should handle KV operations', async () => {
      const store = new KVStore();
      
      // エラーが発生してもnullを返すことを確認
      const state = await store.getAgentState();
      expect(state).toBeNull();
      
      const comment = await store.getComment('test');
      expect(comment).toBeNull();
      
      const comments = await store.getRecentComments(10);
      expect(comments).toEqual([]);
    });
  });

  describe('ConfigSync', () => {
    const mockEdgeConfig = require('@vercel/edge-config');
    let edgeConfigClient: EdgeConfigClient;
    let localConfig: any;

    beforeEach(() => {
      jest.clearAllMocks();
      edgeConfigClient = new EdgeConfigClient();
      localConfig = {
        comment: {
          tone: 'casual',
          ngWords: ['local1', 'local2'],
        },
        youtube: {
          clientId: 'secret-id',
          clientSecret: 'secret-key',
        },
      };
    });

    it('should sync configuration from Edge Config', async () => {
      const remoteConfig = {
        comment: {
          tone: 'friendly',
          targetLength: { min: 30, max: 150 },
        },
      };

      mockEdgeConfig.get.mockResolvedValue(remoteConfig);

      const sync = new ConfigSync(edgeConfigClient);
      const synced = await sync.syncConfig(localConfig);

      // リモート設定が優先される
      expect(synced.comment.tone).toBe('friendly');
      // ローカルのみの設定は保持される
      expect(synced.comment.ngWords).toEqual(['local1', 'local2']);
      // シークレットは保持される
      expect(synced.youtube).toEqual(localConfig.youtube);
    });

    it('should not expose secrets to Edge Config', async () => {
      const sync = new ConfigSync(edgeConfigClient);
      const sanitized = sync.sanitizeForEdgeConfig(localConfig);

      expect(sanitized.comment).toBeDefined();
      expect(sanitized.youtube).toBeUndefined();
    });

    it('should handle sync conflicts', async () => {
      const remoteConfig = {
        comment: {
          tone: 'friendly',
          ngWords: ['remote1'],
        },
      };

      mockEdgeConfig.get.mockResolvedValue(remoteConfig);

      const sync = new ConfigSync(edgeConfigClient);
      const synced = await sync.syncConfig(localConfig, {
        preserveLocal: ['comment.ngWords'],
      });

      // preserveLocalで指定された項目はローカルが優先
      expect(synced.comment.ngWords).toEqual(['local1', 'local2']);
      expect(synced.comment.tone).toBe('friendly');
    });

    it('should validate synced configuration', async () => {
      const invalidRemoteConfig = {
        comment: {
          tone: 'invalid-tone',
        },
      };

      mockEdgeConfig.get.mockResolvedValue(invalidRemoteConfig);

      const sync = new ConfigSync(edgeConfigClient);
      
      await expect(sync.syncConfig(localConfig)).rejects.toThrow('Invalid configuration');
    });

    it('should handle Edge Config unavailability', async () => {
      mockEdgeConfig.get.mockRejectedValue(new Error('Network error'));

      const sync = new ConfigSync(edgeConfigClient);
      const synced = await sync.syncConfig(localConfig, {
        fallbackToLocal: true,
      });

      // Edge Config が利用できない場合はローカル設定を使用
      expect(synced).toEqual(localConfig);
    });
  });
});
