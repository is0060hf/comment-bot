import { promises as fs } from 'fs';
import path from 'path';

import { watch } from 'chokidar';
import * as yaml from 'js-yaml';
import { z } from 'zod';

import { AppConfig, AppConfigSchema, DEFAULT_CONFIG, ProviderConfigWithPriority } from './types';


/**
 * 設定管理クラス
 * YAMLファイルベースの設定管理とバリデーション
 */
export class ConfigManager {
  private config: AppConfig = DEFAULT_CONFIG;
  private watcher?: ReturnType<typeof watch>;

  constructor(private readonly configPath: string) {}

  /**
   * 設定をロード
   * ファイルが存在しない場合はデフォルト設定で作成
   */
  async loadConfig(): Promise<AppConfig> {
    try {
      // ファイルが存在するか確認
      await fs.access(this.configPath);

      // YAMLファイルを読み込み
      const content = await fs.readFile(this.configPath, 'utf-8');
      const rawConfig = yaml.load(content);

      // デフォルト設定とマージしてからバリデーション
      const merged = this.deepMerge(DEFAULT_CONFIG, rawConfig);
      this.config = AppConfigSchema.parse(merged);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        // ファイルが存在しない場合はデフォルト設定を保存
        await this.saveConfig(DEFAULT_CONFIG);
        this.config = DEFAULT_CONFIG;
      } else if (error instanceof z.ZodError) {
        // バリデーションエラー
        throw new Error(`Config validation failed: ${error.message}`);
      } else {
        throw error;
      }
    }

    return this.config;
  }

  /**
   * 設定をマージ
   * UI からの更新を既存設定にマージ
   */
  async mergeConfig(updates: Record<string, any>): Promise<AppConfig> {
    // Deep merge with existing config
    const merged = this.deepMerge(this.config, updates);

    // バリデーション
    const validated = AppConfigSchema.parse(merged);

    // 保存
    await this.saveConfig(validated);
    this.config = validated;

    return validated;
  }

  /**
   * プロバイダ設定を取得（優先順位付き）
   */
  getProviderConfig(providerType: 'stt' | 'llm'): ProviderConfigWithPriority {
    if (providerType === 'stt') {
      const sttConfig = this.config.providers.stt;
      return {
        primary: sttConfig.primary,
        fallback: sttConfig.fallback,
        priority: [sttConfig.primary, ...sttConfig.fallback],
      };
    } else {
      const llmConfig = this.config.providers.llm;
      return {
        primary: llmConfig.primary,
        model: llmConfig.model,
        fallback: [],
        priority: [llmConfig.primary],
      };
    }
  }

  /**
   * 設定を更新
   */
  async updateConfig(updates: Record<string, any>): Promise<void> {
    await this.mergeConfig(updates);
  }

  /**
   * 設定ファイルの変更を監視
   */
  watchConfig(callback: (config: AppConfig) => void): void {
    // 既存のウォッチャーがあれば停止
    if (this.watcher) {
      this.watcher.close();
    }

    this.watcher = watch(this.configPath, {
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('change', async () => {
      try {
        const newConfig = await this.loadConfig();
        callback(newConfig);
      } catch (error) {
        console.error('Error reloading config:', error);
      }
    });
  }

  /**
   * ウォッチャーを停止
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * 設定をファイルに保存
   */
  private async saveConfig(config: AppConfig): Promise<void> {
    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });

    // YAMLとして保存
    const yamlContent = yaml.dump(config, {
      styles: {
        '!!null': 'canonical',
      },
      sortKeys: false,
    });

    await fs.writeFile(this.configPath, yamlContent, 'utf-8');
  }

  /**
   * Deep merge helper
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  /**
   * オブジェクト判定
   */
  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}
