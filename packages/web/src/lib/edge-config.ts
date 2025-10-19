/**
 * Edge Config管理
 */

import { AppConfig } from '../shared/types';

// Edge Configのキャッシュ
let configCache: Partial<AppConfig> | null = null;

/**
 * 設定を取得
 * @returns 現在の設定
 */
export async function getConfig(): Promise<Partial<AppConfig>> {
  // キャッシュがあればそれを返す
  if (configCache) {
    return configCache;
  }

  // Vercel Edge Configから取得（開発環境ではダミーデータ）
  if (process.env.VERCEL_ENV === 'production') {
    // TODO: 実際のEdge Config実装
    // const config = await get('comment-bot-config');
    // return config;
  }

  // 開発環境のデフォルト設定
  const defaultConfig: Partial<AppConfig> = {
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

  configCache = defaultConfig;
  return defaultConfig;
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
    // Edge Configに保存（開発環境ではキャッシュに保存）
    if (process.env.VERCEL_ENV === 'production') {
      // TODO: 実際のEdge Config実装
      // await update('comment-bot-config', config);
    }

    // キャッシュを更新
    configCache = {
      ...configCache,
      ...config,
    };

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
