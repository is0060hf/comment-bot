/**
 * 安全設定のServer Actions
 */

'use server';

import { apiClient } from '@/lib/api';
import { SafetyConfig, AppConfig } from '@/shared/types';
import { z } from 'zod';

// バリデーションスキーマ
const SafetyConfigSchema = z.object({
  level: z.enum(['strict', 'standard', 'relaxed']),
  enabled: z.boolean(),
  blockOnUncertainty: z.boolean().optional(),
  moderationThresholds: z.object({
    hate: z.number().min(0).max(1),
    harassment: z.number().min(0).max(1),
    'self-harm': z.number().min(0).max(1),
    sexual: z.number().min(0).max(1),
    violence: z.number().min(0).max(1),
    illegal: z.number().min(0).max(1),
    graphic: z.number().min(0).max(1),
  }).optional(),
});

/**
 * 安全設定を更新
 * @param safetyConfig 更新する安全設定
 * @returns 更新結果
 */
export async function updateSafetySettings(safetyConfig: Partial<SafetyConfig>) {
  try {
    // バリデーション
    const validationResult = SafetyConfigSchema.partial().safeParse(safetyConfig);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      return {
        success: false,
        error: firstError?.path.includes('level') 
          ? 'Invalid safety level' 
          : 'Invalid threshold values',
      };
    }

    // 部分更新の場合は既存の設定を取得
    let fullConfig: SafetyConfig;
    if (!validationResult.data.moderationThresholds || Object.keys(validationResult.data).length < 4) {
      const currentConfig = await apiClient.get<Partial<AppConfig>>('/api/config');
      fullConfig = {
        ...currentConfig.safety,
        ...validationResult.data,
      } as SafetyConfig;
    } else {
      fullConfig = validationResult.data as SafetyConfig;
    }

    // APIを呼び出して設定を更新
    const result = await apiClient.post('/api/config', {
      safety: fullConfig,
    });

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error('Failed to update safety settings:', error);
    return {
      success: false,
      error: 'Failed to update safety settings',
    };
  }
}

/**
 * コンテンツのモデレーションをテスト
 * @param content テストするコンテンツ
 * @returns モデレーション結果
 */
export async function testModeration(content: string) {
  try {
    // コンテンツの検証
    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: 'Content cannot be empty',
      };
    }

    if (content.length > 1000) {
      return {
        success: false,
        error: 'Content too long (max 1000 characters)',
      };
    }

    // APIを呼び出してモデレーションをテスト
    const result = await apiClient.post('/api/moderation/test', {
      content,
    });

    return result;
  } catch (error) {
    console.error('Failed to test moderation:', error);
    return {
      success: false,
      error: 'Failed to test moderation',
    };
  }
}
