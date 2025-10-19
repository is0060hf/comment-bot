/**
 * Edge Config管理
 */

import { AppConfig } from '../shared/types';
import { EdgeConfigClient } from './edge-config-client';
import { ConfigSync } from './config-sync';

// Edge Configのキャッシュ
let configCache: Partial<AppConfig> | null = null;

// クライアントのインスタンス
const edgeConfigClient = new EdgeConfigClient();
const configSync = new ConfigSync(edgeConfigClient);

/**
 * 設定を取得
 * @returns 現在の設定
 */
export async function getConfig(): Promise<Partial<AppConfig>> {
  // キャッシュがあればそれを返す
  if (configCache && process.env.NODE_ENV === 'production') {
    return configCache;
  }

  // Vercel Edge Configから取得
  if (process.env.VERCEL_ENV === 'production' || process.env.EDGE_CONFIG) {
    try {
      const localConfig = getDefaultConfig();
      const syncedConfig = await configSync.syncConfig(localConfig, {
        fallbackToLocal: true,
        preserveLocal: ['youtube', 'providers'], // シークレット情報は保持
      });
      configCache = syncedConfig;
      return syncedConfig;
    } catch (error) {
      console.warn('Failed to sync with Edge Config:', error);
    }
  }

  // デフォルト設定を返す
  const defaultConfig = getDefaultConfig();
  configCache = defaultConfig;
  return defaultConfig;
}

/**
 * デフォルト設定を取得
 */
function getDefaultConfig(): Partial<AppConfig> {
  return {
    comment: {
      tone: 'friendly',
      characterPersona: 'フレンドリーな視聴者',
      targetLength: { min: 20, max: 100 },
      encouragedExpressions: ['なるほど！', 'すごい！', '勉強になります！'],
      ngWords: [],
      emojiPolicy: {
        enabled: true,
        maxCount: 3,
        allowedEmojis: ['👍', '😊', '🎉', '💡', '🔥'],
      },
    },
    timing: {
      minimumInterval: 30,
      maxCommentsPerTenMinutes: 5,
      cooldownAfterBurst: 120,
      deduplicationWindow: 300,
    },
    safety: {
      level: 'standard',
      enabled: true,
      blockOnUncertainty: false,
      moderationThresholds: {
        hate: 0.7,
        harassment: 0.7,
        'self-harm': 0.8,
        sexual: 0.8,
        violence: 0.7,
        illegal: 0.9,
        graphic: 0.8,
      },
    },
  };
}

/**
 * 設定を更新
 * @param config 更新する設定
 * @returns 更新結果
 */
export async function updateConfig(config: Partial<AppConfig>): Promise<{
  success: boolean;
  data?: Partial<AppConfig>;
  error?: string;
}> {
  try {
    // 現在の設定を取得
    const currentConfig = await getConfig();
    
    // 設定をマージ
    const updatedConfig = {
      ...currentConfig,
      ...config,
    };

    // Edge Configに保存可能な部分のみを抽出
    if (process.env.VERCEL_ENV === 'production' || process.env.EDGE_CONFIG) {
      const sanitizedConfig = configSync.sanitizeForEdgeConfig(updatedConfig);
      // TODO: Edge Config APIでの更新はRead-onlyのため、
      // 実際の更新はVercelダッシュボードまたはAPIで行う必要がある
      console.log('Sanitized config for Edge Config:', sanitizedConfig);
    }

    // キャッシュを更新
    configCache = updatedConfig;

    return {
      success: true,
      data: configCache,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
