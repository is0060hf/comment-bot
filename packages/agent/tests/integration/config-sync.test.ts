/**
 * Tsumiki AITDD - Refactor Phase
 * タスク42: 設定同期機能の統合テスト
 */

import { ConfigSync, ConfigManager, AppConfig } from '../../src/config';
import { MockEdgeConfigClient } from '../../src/adapters/mocks/edge-config';
import { Logger, LogLevel } from '../../src/logging';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Config Sync Integration', () => {
  const testConfigDir = path.join(process.cwd(), 'tests', 'integration', 'test-configs');
  const testConfigPath = path.join(testConfigDir, 'config.yaml');
  const testLogDir = path.join(testConfigDir, 'logs');

  let configSync: ConfigSync;
  let configManager: ConfigManager;
  let mockEdgeConfigClient: MockEdgeConfigClient;
  let logger: Logger;

  beforeEach(() => {
    // テスト用ディレクトリを作成
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }
    fs.mkdirSync(testConfigDir, { recursive: true });
    fs.mkdirSync(testLogDir, { recursive: true });

    // モックEdgeConfigClient
    mockEdgeConfigClient = new MockEdgeConfigClient();
    mockEdgeConfigClient.setEnabled(true);

    // ロガー
    logger = new Logger({
      level: LogLevel.INFO,
      logDir: testLogDir,
      console: false,
    });

    // ConfigManager
    configManager = new ConfigManager(testConfigPath);

    // ConfigSync
    configSync = new ConfigSync({
      configManager,
      edgeConfigClient: mockEdgeConfigClient as any,
      syncInterval: 1000, // 1秒
      enableAutoSync: false,
      logger,
    });
  });

  afterEach(() => {
    configSync.stop();
    logger.close();
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }
  });

  test('ローカルファイルとEdge Configの同期フロー', async () => {
    // ローカル設定を作成
    const localConfig: Partial<AppConfig> = {
      comment: {
        tone: 'friendly',
        characterPersona: 'ローカル太郎',
        targetLength: { min: 20, max: 60 },
        encouragedExpressions: ['なるほど'],
        ngWords: ['bad1'],
        emojiPolicy: {
          enabled: true,
          maxCount: 2,
          allowedEmojis: ['👍'],
        },
      },
      safety: {
        enabled: true,
        level: 'standard',
        blockOnUncertainty: true,
        moderationThresholds: {
          hate: 0.7,
          harassment: 0.7,
          selfHarm: 0.8,
          sexual: 0.7,
          violence: 0.7,
          illegal: 0.8,
          graphic: 0.8,
        },
      },
    };

    await configManager.saveConfig(localConfig);

    // Edge Configを設定
    const edgeConfig = {
      comment: {
        tone: 'casual',
        targetLength: { max: 50 },
      },
      safety: {
        level: 'strict',
      },
    };

    mockEdgeConfigClient.setMockData('comment-bot-config', edgeConfig);

    // 同期を実行
    const result = await configSync.sync();

    expect(result.success).toBe(true);
    expect(result.updatedFields).toContain('comment.tone');
    expect(result.updatedFields).toContain('comment.targetLength.max');
    expect(result.updatedFields).toContain('safety.level');

    // 更新された設定を確認
    const updatedConfig = await configManager.loadConfig();
    expect(updatedConfig.comment.tone).toBe('casual');
    expect(updatedConfig.comment.targetLength.max).toBe(50);
    expect(updatedConfig.comment.targetLength.min).toBe(20); // ローカルの値が保持
    expect(updatedConfig.comment.characterPersona).toBe('ローカル太郎'); // ローカルの値が保持
    expect(updatedConfig.safety.level).toBe('strict');
  });

  test('自動同期とイベント監視', async () => {
    jest.useFakeTimers();

    const beforeSyncSpy = jest.fn();
    const afterSyncSpy = jest.fn();
    const errorSpy = jest.fn();

    configSync.on('beforeSync', beforeSyncSpy);
    configSync.on('afterSync', afterSyncSpy);
    configSync.on('syncError', errorSpy);

    // Edge Configを設定
    mockEdgeConfigClient.setMockData('comment-bot-config', {
      comment: { tone: 'casual' },
    });

    // 自動同期を開始
    const autoSyncConfig = new ConfigSync({
      configManager,
      edgeConfigClient: mockEdgeConfigClient as any,
      syncInterval: 2000, // 2秒
      enableAutoSync: false, // 手動で開始
      logger,
    });

    autoSyncConfig.on('beforeSync', beforeSyncSpy);
    autoSyncConfig.on('afterSync', afterSyncSpy);
    autoSyncConfig.on('syncError', errorSpy);

    autoSyncConfig.start();

    // 初回同期
    await jest.advanceTimersByTimeAsync(0);
    expect(beforeSyncSpy).toHaveBeenCalledTimes(1);
    expect(afterSyncSpy).toHaveBeenCalledTimes(1);

    // 2秒後の同期
    await jest.advanceTimersByTimeAsync(2000);
    expect(beforeSyncSpy).toHaveBeenCalledTimes(2);
    expect(afterSyncSpy).toHaveBeenCalledTimes(2);

    // エラーは発生していない
    expect(errorSpy).not.toHaveBeenCalled();

    autoSyncConfig.stop();
    jest.useRealTimers();
  });

  test('設定の競合解決', async () => {
    // 安全性優先戦略のテスト
    const localConfig: Partial<AppConfig> = {
      safety: {
        enabled: true,
        level: 'relaxed',
        blockOnUncertainty: false,
        moderationThresholds: {
          hate: 0.9,
          harassment: 0.9,
          selfHarm: 0.9,
          sexual: 0.9,
          violence: 0.9,
          illegal: 0.9,
          graphic: 0.9,
        },
      },
    };

    await configManager.saveConfig(localConfig);

    const edgeConfig = {
      safety: {
        level: 'strict',
        moderationThresholds: {
          hate: 0.5,
          harassment: 0.5,
        },
      },
    };

    mockEdgeConfigClient.setMockData('comment-bot-config', edgeConfig);

    // 安全性優先で同期
    await configSync.sync({ conflictStrategy: 'safety-first' });

    const updatedConfig = await configManager.loadConfig();
    expect(updatedConfig.safety.level).toBe('strict'); // より厳しい値
    expect(updatedConfig.safety.moderationThresholds.hate).toBe(0.5); // より厳しい値
    expect(updatedConfig.safety.moderationThresholds.selfHarm).toBe(0.9); // ローカルの値（Edge Configに含まれない）
  });

  test('エラーハンドリングとログ記録', async () => {
    // 無効な設定でエラーを発生させる
    const invalidEdgeConfig = {
      comment: {
        targetLength: {
          min: 100,
          max: 50, // min > max で無効
        },
      },
    };

    mockEdgeConfigClient.setMockData('comment-bot-config', invalidEdgeConfig);

    const errorSpy = jest.fn();
    configSync.on('syncError', errorSpy);

    const result = await configSync.sync();

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(errorSpy).toHaveBeenCalled();

    // エラーログを確認
    await new Promise(resolve => setTimeout(resolve, 100));

    const logFiles = fs.readdirSync(testLogDir);
    expect(logFiles.length).toBeGreaterThan(0);

    const logContent = fs.readFileSync(
      path.join(testLogDir, logFiles[0]!),
      'utf-8'
    );
    expect(logContent).toContain('validation');
  });

  test('設定ファイルの変更監視', async () => {
    const changeCallback = jest.fn();
    configManager.watchConfig(changeCallback);

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

    // ファイルを直接更新
    const newConfig = await configManager.loadConfig();
    newConfig.comment.tone = 'casual';
    const yamlContent = yaml.dump(newConfig);
    await fs.promises.writeFile(testConfigPath, yamlContent, 'utf-8');

    // 変更が検知されるまで待つ
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(changeCallback).toHaveBeenCalled();
    const changedConfig = changeCallback.mock.calls[0][0];
    expect(changedConfig.comment.tone).toBe('casual');

    configManager.stopWatching();
  });

  test('PIIのマスキングとセキュリティ', async () => {
    // シークレット情報を含む設定
    const edgeConfig = {
      comment: {
        tone: 'casual',
      },
      _youtube: {
        clientId: 'edge-client-id',
        clientSecret: 'edge-secret',
      },
      providers: {
        apiKeys: {
          openai: 'sk-edge-key',
        },
      },
    };

    mockEdgeConfigClient.setMockData('comment-bot-config', edgeConfig);

    await configSync.sync();

    const updatedConfig = await configManager.loadConfig();
    
    // シークレットはマージされない
    expect((updatedConfig as any)._youtube).toBeUndefined();
    expect((updatedConfig.providers as any).apiKeys).toBeUndefined();
    
    // 通常の設定はマージされる
    expect(updatedConfig.comment.tone).toBe('casual');
  });
});

