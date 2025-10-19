/**
 * Tsumiki AITDD - Red Phase
 * タスク42: 設定同期機能のテストケース
 */

import { ConfigSync, ConfigSyncOptions } from '../../src/config/config-sync';
import { ConfigManager } from '../../src/config/config-manager';
import { AppConfig } from '../../src/config/types';
import { EdgeConfigClient } from '../../src/adapters/edge-config';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('ConfigSync', () => {
  let configSync: ConfigSync;
  let configManager: ConfigManager;
  let mockEdgeConfigClient: jest.Mocked<EdgeConfigClient>;
  const testConfigDir = path.join(process.cwd(), 'tests', 'config', 'test-configs');
  const testConfigPath = path.join(testConfigDir, 'config.yaml');

  beforeEach(() => {
    // テスト用ディレクトリを作成
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }
    fs.mkdirSync(testConfigDir, { recursive: true });

    // モックEdgeConfigClient
    mockEdgeConfigClient = {
      get: jest.fn(),
      getAll: jest.fn(),
      has: jest.fn(),
      isEnabled: jest.fn().mockReturnValue(false),
    } as any;

    configManager = new ConfigManager(testConfigPath);
    
    const options: ConfigSyncOptions = {
      configManager,
      edgeConfigClient: mockEdgeConfigClient,
      syncInterval: 30000,
      enableAutoSync: false,
    };

    configSync = new ConfigSync(options);
  });

  afterEach(() => {
    configSync.stop();
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }
  });

  describe('Edge Config fetch', () => {
    test('Edge Configから設定を取得できること', async () => {
      const edgeConfig = {
        comment: {
          tone: 'casual',
          personaName: 'Edge太郎',
          maxLength: 50,
        },
        safety: {
          enabled: true,
          level: 'high',
        },
      };

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockResolvedValue(edgeConfig);

      const fetchedConfig = await configSync.fetchEdgeConfig();

      expect(fetchedConfig).toEqual(edgeConfig);
      expect(mockEdgeConfigClient.get).toHaveBeenCalledWith('comment-bot-config');
    });

    test('Edge Configが無効な場合はnullを返すこと', async () => {
      mockEdgeConfigClient.isEnabled.mockReturnValue(false);

      const fetchedConfig = await configSync.fetchEdgeConfig();

      expect(fetchedConfig).toBeNull();
      expect(mockEdgeConfigClient.get).not.toHaveBeenCalled();
    });

    test('Edge Configのエラーをハンドリングすること', async () => {
      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockRejectedValue(new Error('Network error'));

      const fetchedConfig = await configSync.fetchEdgeConfig();

      expect(fetchedConfig).toBeNull();
    });
  });

  describe('Config merging', () => {
    test('ローカル設定とEdge Configをマージできること', () => {
      const localConfig: Partial<AppConfig> = {
        comment: {
          tone: 'friendly',
          characterPersona: 'ローカル太郎',
          targetLength: {
            min: 10,
            max: 100,
          },
          encouragedExpressions: ['なるほど', 'すごい'],
          ngWords: ['bad1', 'bad2'],
          emojiPolicy: {
            enabled: true,
            maxCount: 3,
            allowedEmojis: ['👍', '😊'],
          },
        },
        providers: {
          stt: {
            primary: 'deepgram',
            fallback: ['gcp', 'whisper'],
          },
          llm: {
            primary: 'openai',
            model: 'gpt-4o-mini',
          },
          moderation: ['openai_moderation', 'rule_based'],
        },
      };

      const edgeConfig = {
        comment: {
          tone: 'casual',
          characterPersona: 'Edge太郎',
          targetLength: {
            max: 50,
          },
        },
        safety: {
          enabled: true,
          level: 'strict',
        },
      };

      const merged = configSync.mergeConfigs(localConfig as AppConfig, edgeConfig);

      // Edge Configの値が優先される
      expect(merged.comment.tone).toBe('casual');
      expect(merged.comment.characterPersona).toBe('Edge太郎');
      expect(merged.comment.targetLength.max).toBe(50);
      
      // Edge Configに存在しない値はローカルの値が保持される
      expect(merged.comment.targetLength.min).toBe(10);
      expect(merged.comment.ngWords).toEqual(['bad1', 'bad2']);
      
      // Edge Configの新しい設定が追加される
      expect(merged.safety.enabled).toBe(true);
      expect(merged.safety.level).toBe('strict');
    });

    test('シークレット情報はマージから除外されること', () => {
      // YouTubeの認証情報は型定義に含まれないため、
      // 別途ConfigManagerで管理されることを想定
      const localConfig: any = {
        providers: {
          stt: {
            primary: 'deepgram',
            fallback: ['gcp'],
          },
        },
        _youtube: {
          clientId: 'local-client-id',
          clientSecret: 'local-secret',
          refreshToken: 'local-token',
        },
      };

      const edgeConfig = {
        _youtube: {
          clientId: 'edge-client-id',
          clientSecret: 'edge-secret',
          refreshToken: 'edge-token',
        },
      };

      const merged = configSync.mergeConfigs(localConfig as AppConfig, edgeConfig);

      // YouTubeの認証情報はシークレットなので、保護される
      // Edge Configに含まれていてもマージされない
      expect((merged as any)._youtube?.clientId).toBe('local-client-id');
      expect((merged as any)._youtube?.clientSecret).toBe('local-secret');
      expect((merged as any)._youtube?.refreshToken).toBe('local-token');
    });

    test('深いネストの設定も正しくマージされること', () => {
      const localConfig: Partial<AppConfig> = {
        rateLimit: {
          messagesPerWindow: 5,
          windowSeconds: 30,
          minIntervalSeconds: 10,
        },
      };

      const edgeConfig = {
        rateLimit: {
          messagesPerWindow: 3,
          minIntervalSeconds: 20,
          // windowSecondsは含まれない
        },
      };

      const merged = configSync.mergeConfigs(localConfig as AppConfig, edgeConfig);

      expect(merged.rateLimit.minIntervalSeconds).toBe(20);
      expect(merged.rateLimit.messagesPerWindow).toBe(3);
      expect(merged.rateLimit.windowSeconds).toBe(30); // ローカルの値が保持される
    });
  });

  describe('Auto sync', () => {
    test('自動同期が有効な場合、定期的に同期が実行されること', async () => {
      jest.useFakeTimers();

      const syncOptions: ConfigSyncOptions = {
        configManager,
        edgeConfigClient: mockEdgeConfigClient,
        syncInterval: 5000, // 5秒
        enableAutoSync: true,
      };

      configSync = new ConfigSync(syncOptions);

      const edgeConfig = {
        comment: {
          tone: 'casual',
        },
      };

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockResolvedValue(edgeConfig);

      const syncSpy = jest.spyOn(configSync, 'sync');

      configSync.start();

      // 初回の同期
      await jest.advanceTimersByTimeAsync(0);
      expect(syncSpy).toHaveBeenCalledTimes(1);

      // 5秒後の同期
      await jest.advanceTimersByTimeAsync(5000);
      expect(syncSpy).toHaveBeenCalledTimes(2);

      // さらに5秒後の同期
      await jest.advanceTimersByTimeAsync(5000);
      expect(syncSpy).toHaveBeenCalledTimes(3);

      configSync.stop();
      jest.useRealTimers();
    });

    test('同期エラーが発生しても自動同期が継続されること', async () => {
      jest.useFakeTimers();

      // 初期設定を保存
      await configManager.saveConfig({
        comment: {
          tone: 'friendly',
          characterPersona: '初期太郎',
          targetLength: { min: 20, max: 60 },
          encouragedExpressions: [],
          ngWords: [],
          emojiPolicy: {
            enabled: true,
            maxCount: 1,
            allowedEmojis: [],
          },
        },
      });

      const syncOptions: ConfigSyncOptions = {
        configManager,
        edgeConfigClient: mockEdgeConfigClient,
        syncInterval: 5000,
        enableAutoSync: true,
      };

      configSync = new ConfigSync(syncOptions);

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({ comment: { tone: 'casual' } });

      configSync.start();

      // 初回の同期（エラー）
      await jest.advanceTimersByTimeAsync(0);
      
      // 5秒後の同期（成功）
      await jest.advanceTimersByTimeAsync(5000);
      
      const config = await configManager.loadConfig();
      expect(config.comment.tone).toBe('casual');

      configSync.stop();
      jest.useRealTimers();
    });
  });

  describe('Manual sync', () => {
    test('手動同期が実行できること', async () => {
      const localConfig: Partial<AppConfig> = {
        comment: {
          tone: 'friendly',
          characterPersona: 'ローカル太郎',
          targetLength: {
            min: 20,
            max: 60,
          },
          ngWords: [],
          encouragedExpressions: [],
          emojiPolicy: {
            enabled: true,
            maxCount: 1,
            allowedEmojis: [],
          },
        },
      };

      // ローカル設定を保存
      await configManager.saveConfig(localConfig as AppConfig);

      const edgeConfig = {
        comment: {
          tone: 'casual',
          targetLength: {
            max: 50,
          },
        },
      };

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockResolvedValue(edgeConfig);

      await configSync.sync();

      const updatedConfig = await configManager.loadConfig();
      expect(updatedConfig.comment.tone).toBe('casual');
      expect(updatedConfig.comment.characterPersona).toBe('ローカル太郎');
      expect(updatedConfig.comment.targetLength.max).toBe(50);
    });

    test('同期前後でイベントが発火されること', async () => {
      const beforeSyncSpy = jest.fn();
      const afterSyncSpy = jest.fn();

      configSync.on('beforeSync', beforeSyncSpy);
      configSync.on('afterSync', afterSyncSpy);

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockResolvedValue({ comment: { tone: 'casual' } });

      await configSync.sync();

      expect(beforeSyncSpy).toHaveBeenCalled();
      expect(afterSyncSpy).toHaveBeenCalledWith({
        success: true,
        updatedFields: ['comment.tone'],
      });
    });

    test('同期エラー時にエラーイベントが発火されること', async () => {
      const errorSpy = jest.fn();
      configSync.on('syncError', errorSpy);

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockRejectedValue(new Error('Sync failed'));

      await configSync.sync();

      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Sync failed',
      }));
    });
  });

  describe('Conflict resolution', () => {
    test('設定の競合が検出されること', async () => {
      const localConfig: any = {
        comment: {
          tone: 'friendly',
          lastModified: new Date('2024-01-01').toISOString(),
          targetLength: {
            min: 20,
            max: 60,
          },
          characterPersona: 'ローカル太郎',
          encouragedExpressions: [],
          ngWords: [],
          emojiPolicy: {
            enabled: true,
            maxCount: 1,
            allowedEmojis: [],
          },
        },
      };

      await configManager.saveConfig(localConfig as AppConfig);

      const edgeConfig = {
        comment: {
          tone: 'casual',
          lastModified: new Date('2024-01-02').toISOString(),
        },
      };

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockResolvedValue(edgeConfig);

      const conflicts = await configSync.detectConflicts();

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        field: 'comment.tone',
        localValue: 'friendly',
        remoteValue: 'casual',
        resolution: 'remote', // より新しいタイムスタンプが優先
      });
    });

    test('競合解決戦略が適用されること', async () => {
      const localConfig: Partial<AppConfig> = {
        comment: {
          tone: 'friendly',
          targetLength: {
            min: 20,
            max: 100,
          },
          characterPersona: 'ローカル太郎',
          encouragedExpressions: [],
          ngWords: [],
          emojiPolicy: {
            enabled: true,
            maxCount: 1,
            allowedEmojis: [],
          },
        },
        safety: {
          enabled: true,
          level: 'relaxed',
          blockOnUncertainty: true,
          moderationThresholds: {
            hate: 0.7,
            harassment: 0.7,
            selfHarm: 0.8,
            sexual: 0.8,
            violence: 0.8,
            illegal: 0.8,
            graphic: 0.8,
          },
        },
      };

      await configManager.saveConfig(localConfig as AppConfig);

      const edgeConfig = {
        comment: {
          tone: 'casual',
        },
        safety: {
          level: 'strict',
        },
      };

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockResolvedValue(edgeConfig);

      // 安全性設定は常により厳しい値を選択
      await configSync.sync({ conflictStrategy: 'safety-first' });

      const updatedConfig = await configManager.loadConfig();
      expect(updatedConfig.comment.tone).toBe('casual'); // 通常のマージ
      expect(updatedConfig.safety.level).toBe('strict'); // より厳しい値
    });
  });

  describe('Validation', () => {
    test('同期後の設定が検証されること', async () => {
      const invalidEdgeConfig = {
        comment: {
          tone: 'invalid-tone', // 無効な値
          targetLength: {
            min: 200, // maxより大きい
            max: 50,
          },
        },
      };

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockResolvedValue(invalidEdgeConfig);

      const errorSpy = jest.fn();
      configSync.on('syncError', errorSpy);

      await configSync.sync();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'validation',
        })
      );
    });

    test('部分的な設定更新でも全体が有効であること', async () => {
      const partialEdgeConfig = {
        comment: {
          tone: 'casual',
          // その他のフィールドは含まれない
        },
      };

      mockEdgeConfigClient.isEnabled.mockReturnValue(true);
      mockEdgeConfigClient.get.mockResolvedValue(partialEdgeConfig);

      await configSync.sync();

      const updatedConfig = await configManager.loadConfig();
      // デフォルト値と組み合わされて有効な設定になる
      expect(updatedConfig.comment.tone).toBe('casual');
      expect(updatedConfig.comment.targetLength.min).toBeGreaterThan(0);
      expect(updatedConfig.comment.targetLength.max).toBeGreaterThan(0);
    });
  });
});
