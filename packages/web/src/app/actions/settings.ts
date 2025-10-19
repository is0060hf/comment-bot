/**
 * 設定更新のServer Actions
 */

'use server';

import { apiClient } from '@/lib/api';
import { AppConfig } from '@/shared/types';
import { z } from 'zod';

// バリデーションスキーマ
const UpdateSettingsSchema = z.object({
  comment: z.object({
    tone: z.enum(['friendly', 'casual', 'formal', 'enthusiastic']).optional(),
    characterPersona: z.string().optional(),
    targetLength: z.object({
      min: z.number().min(10).max(200),
      max: z.number().min(10).max(200),
    }).refine(data => data.min <= data.max, {
      message: 'Minimum length cannot exceed maximum',
    }).optional(),
    encouragedExpressions: z.array(z.string()).optional(),
    ngWords: z.array(z.string()).optional(),
    emojiPolicy: z.object({
      enabled: z.boolean(),
      maxCount: z.number().min(0).max(10),
      allowedEmojis: z.array(z.string()),
    }).optional(),
  }).optional(),
});

/**
 * 設定を更新
 * @param config 更新する設定
 * @returns 更新結果
 */
export async function updateSettings(config: Partial<AppConfig>) {
  try {
    // バリデーション
    const validationResult = UpdateSettingsSchema.safeParse(config);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      const errorMessage = firstError?.message || 'validation failed';
      return {
        success: false,
        error: `Invalid configuration: ${errorMessage}`,
      };
    }

    // NGワードの空文字列をフィルタリング
    if (config.comment?.ngWords) {
      config.comment.ngWords = config.comment.ngWords
        .map(word => word.trim())
        .filter(word => word.length > 0);
    }

    // APIを呼び出して設定を更新
    const result = await apiClient.post('/api/config', config);

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error('Failed to update settings:', error);
    return {
      success: false,
      error: 'Failed to update settings',
    };
  }
}
