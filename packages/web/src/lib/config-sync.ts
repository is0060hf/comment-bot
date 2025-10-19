/**
 * Edge Configとローカル設定の同期
 */

import { EdgeConfigClient } from './edge-config-client';
import { AppConfig } from '@/shared/types';
import { z } from 'zod';

interface SyncOptions {
  preserveLocal?: string[];
  fallbackToLocal?: boolean;
}

// 設定バリデーションスキーマ（簡易版）
const ConfigSchema = z.object({
  comment: z.object({
    tone: z.enum(['friendly', 'casual', 'formal', 'enthusiastic']).optional(),
  }).optional(),
}).passthrough();

export class ConfigSync {
  constructor(private edgeConfigClient: EdgeConfigClient) {}

  /**
   * Edge Configとローカル設定を同期
   */
  async syncConfig(
    localConfig: Partial<AppConfig>,
    options: SyncOptions = {}
  ): Promise<Partial<AppConfig>> {
    try {
      // Edge Configから設定を取得
      const remoteConfig = await this.edgeConfigClient.getConfig<Partial<AppConfig>>(
        'comment-bot-config'
      );

      if (!remoteConfig) {
        // リモート設定がない場合
        if (options.fallbackToLocal) {
          return localConfig;
        }
        throw new Error('No remote configuration found');
      }

      // 設定をマージ
      const mergedConfig = this.mergeConfigs(localConfig, remoteConfig, options);

      // バリデーション
      this.validateConfig(mergedConfig);

      return mergedConfig;
    } catch (error) {
      if (options.fallbackToLocal) {
        console.warn('Failed to sync with Edge Config, using local config:', error);
        return localConfig;
      }
      throw error;
    }
  }

  /**
   * Edge Config用に設定をサニタイズ（シークレット情報を除去）
   */
  sanitizeForEdgeConfig(config: Partial<AppConfig>): Partial<AppConfig> {
    const sanitized = { ...config };

    // シークレット情報を削除
    delete sanitized.youtube;
    delete sanitized.providers;

    // APIキーなどの機密情報を含む可能性のあるフィールドを削除
    if (sanitized.comment) {
      // 特定のフィールドのみ保持
      sanitized.comment = {
        tone: sanitized.comment.tone,
        characterPersona: sanitized.comment.characterPersona,
        targetLength: sanitized.comment.targetLength,
        encouragedExpressions: sanitized.comment.encouragedExpressions,
        emojiPolicy: sanitized.comment.emojiPolicy,
      };
    }

    return sanitized;
  }

  /**
   * 設定をマージ
   */
  private mergeConfigs(
    local: Partial<AppConfig>,
    remote: Partial<AppConfig>,
    options: SyncOptions
  ): Partial<AppConfig> {
    const merged = { ...local };

    // リモート設定で上書き
    Object.keys(remote).forEach(key => {
      const k = key as keyof AppConfig;
      
      // preserveLocalで指定されたキーはローカルを優先
      if (options.preserveLocal?.includes(key)) {
        return;
      }

      if (typeof remote[k] === 'object' && !Array.isArray(remote[k])) {
        // オブジェクトの場合は深くマージ
        merged[k] = {
          ...local[k] as any,
          ...remote[k] as any,
        };

        // preserveLocalで指定されたサブキーの処理
        if (options.preserveLocal) {
          options.preserveLocal
            .filter(p => p.includes('.'))
            .forEach(path => {
              const [parentKey, ...subKeys] = path.split('.');
              if (parentKey === key && subKeys.length > 0) {
                const subKey = subKeys[0];
                if (local[k] && (local[k] as any)[subKey] !== undefined) {
                  (merged[k] as any)[subKey] = (local[k] as any)[subKey];
                }
              }
            });
        }
      } else {
        // プリミティブ値や配列はそのまま上書き
        merged[k] = remote[k] as any;
      }
    });

    // preserveLocalで指定されたフィールドを確実に保持
    if (options.preserveLocal) {
      options.preserveLocal.forEach(path => {
        if (!path.includes('.')) {
          // トップレベルのキー
          const k = path as keyof AppConfig;
          if (local[k] !== undefined) {
            merged[k] = local[k] as any;
          }
        } else {
          // ネストされたキー（例: "comment.ngWords"）
          const [parentKey, subKey] = path.split('.');
          const pk = parentKey as keyof AppConfig;
          if (local[pk] && (local[pk] as any)[subKey] !== undefined) {
            if (!merged[pk]) {
              merged[pk] = {} as any;
            }
            (merged[pk] as any)[subKey] = (local[pk] as any)[subKey];
          }
        }
      });
    }

    return merged;
  }

  /**
   * 設定のバリデーション
   */
  private validateConfig(config: Partial<AppConfig>): void {
    const result = ConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`);
    }
  }
}
