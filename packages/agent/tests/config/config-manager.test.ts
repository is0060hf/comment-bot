import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConfigManager } from '../../src/config/config-manager';
import { AppConfig, ProviderConfig } from '../../src/config/types';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    // 一時ディレクトリを作成
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
    configPath = path.join(tempDir, 'config.yaml');
    
    configManager = new ConfigManager(configPath);
  });

  afterEach(async () => {
    // クリーンアップ
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('loadConfig', () => {
    it('should load default config when file does not exist', async () => {
      const config = await configManager.loadConfig();
      
      // デフォルト値の検証
      expect(config.providers.stt.primary).toBe('deepgram');
      expect(config.providers.stt.fallback).toEqual(['gcp', 'whisper']);
      expect(config.providers.llm.primary).toBe('openai');
      expect(config.providers.llm.model).toBe('gpt-4o-mini');
      expect(config.providers.moderation).toEqual(['openai_moderation', 'rule_based']);
      expect(config.safety.level).toBe('standard');
    });

    it('should create config file with defaults if not exists', async () => {
      await configManager.loadConfig();
      
      // ファイルが作成されたことを確認
      const exists = await fs.access(configPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      // ファイル内容を確認
      const content = await fs.readFile(configPath, 'utf-8');
      expect(content).toContain('providers:');
      expect(content).toContain('primary: deepgram');
      expect(content).toContain('model: gpt-4o-mini');
    });

    it('should load existing config from file', async () => {
      // カスタム設定を作成
      const customConfig = `
providers:
  stt:
    primary: gcp
    fallback:
      - deepgram
      - whisper
  llm:
    primary: openai
    model: gpt-4-turbo
  moderation:
    - rule_based
    - openai_moderation
safety:
  level: strict
`;
      await fs.writeFile(configPath, customConfig);
      
      const config = await configManager.loadConfig();
      
      expect(config.providers.stt.primary).toBe('gcp');
      expect(config.providers.llm.model).toBe('gpt-4-turbo');
      expect(config.safety.level).toBe('strict');
    });

    it('should validate config with Zod schema', async () => {
      // 不正な設定を作成
      const invalidConfig = `
providers:
  stt:
    primary: invalid_provider
  llm:
    primary: openai
    model: 123  # should be string
`;
      await fs.writeFile(configPath, invalidConfig);
      
      await expect(configManager.loadConfig()).rejects.toThrow();
    });
  });

  describe('mergeConfig', () => {
    it('should merge UI config with file config', async () => {
      // 基本設定をロード
      const baseConfig = await configManager.loadConfig();
      
      // UI からの設定更新（サニタイズ済み）
      const uiUpdates = {
        providers: {
          stt: {
            primary: 'whisper' as const,
            fallback: ['deepgram', 'gcp'] as const
          }
        },
        comment: {
          targetLength: {
            min: 30,
            max: 50
          }
        }
      };
      
      const mergedConfig = await configManager.mergeConfig(uiUpdates);
      
      // マージ結果の検証
      expect(mergedConfig.providers.stt.primary).toBe('whisper');
      expect(mergedConfig.providers.stt.fallback).toEqual(['deepgram', 'gcp']);
      expect(mergedConfig.comment.targetLength.min).toBe(30);
      expect(mergedConfig.comment.targetLength.max).toBe(50);
      // 他の設定は保持される
      expect(mergedConfig.providers.llm.model).toBe('gpt-4o-mini');
    });

    it('should sanitize and validate merged config', async () => {
      const baseConfig = await configManager.loadConfig();
      
      // 不正な値を含む更新
      const invalidUpdates: any = {
        providers: {
          stt: {
            primary: '<script>alert("xss")</script>',
            fallback: null
          }
        },
        comment: {
          targetLength: {
            min: -10,  // 負の値
            max: 1000  // 大きすぎる値
          }
        }
      };
      
      await expect(configManager.mergeConfig(invalidUpdates)).rejects.toThrow();
    });
  });

  describe('getProviderConfig', () => {
    it('should return provider configuration with priorities', async () => {
      await configManager.loadConfig();
      
      const sttConfig = configManager.getProviderConfig('stt');
      expect(sttConfig).toEqual({
        primary: 'deepgram',
        fallback: ['gcp', 'whisper'],
        priority: ['deepgram', 'gcp', 'whisper']
      });
      
      const llmConfig = configManager.getProviderConfig('llm');
      expect(llmConfig).toEqual({
        primary: 'openai',
        model: 'gpt-4o-mini',
        fallback: [],
        priority: ['openai']
      });
    });
  });

  describe('updateConfig', () => {
    it('should update and persist config changes', async () => {
      await configManager.loadConfig();
      
      const updates = {
        safety: {
          level: 'relaxed' as const
        }
      };
      
      await configManager.updateConfig(updates);
      
      // 新しいインスタンスで確認
      const newManager = new ConfigManager(configPath);
      const reloadedConfig = await newManager.loadConfig();
      
      expect(reloadedConfig.safety.level).toBe('relaxed');
    });
  });

  describe('watchConfig', () => {
    it('should notify on config file changes', async () => {
      await configManager.loadConfig();
      
      const promise = new Promise<void>((resolve) => {
        configManager.watchConfig((newConfig: AppConfig) => {
          expect(newConfig.safety.level).toBe('strict');
          resolve();
        });
      });
      
      // ファイルを更新
      const config = await fs.readFile(configPath, 'utf-8');
      const updatedConfig = config.replace('level: standard', 'level: strict');
      await fs.writeFile(configPath, updatedConfig);
      
      await promise;
    });
  });
});
