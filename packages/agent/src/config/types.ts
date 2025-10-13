import { z } from 'zod';

/**
 * STTプロバイダ
 */
export const STTProviderSchema = z.enum(['deepgram', 'gcp', 'whisper']);
export type STTProvider = z.infer<typeof STTProviderSchema>;

/**
 * LLMプロバイダ
 */
export const LLMProviderSchema = z.enum(['openai']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

/**
 * モデレーションプロバイダ
 */
export const ModerationProviderSchema = z.enum(['openai_moderation', 'rule_based']);
export type ModerationProvider = z.infer<typeof ModerationProviderSchema>;

/**
 * 安全レベル
 */
export const SafetyLevelSchema = z.enum(['strict', 'standard', 'relaxed']);
export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

/**
 * プロバイダ設定
 */
export const ProviderConfigSchema = z.object({
  stt: z.object({
    primary: STTProviderSchema,
    fallback: z.array(STTProviderSchema).default([])
  }),
  llm: z.object({
    primary: LLMProviderSchema,
    model: z.string().default('gpt-4o-mini')
  }),
  moderation: z.array(ModerationProviderSchema).default(['openai_moderation', 'rule_based'])
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * コメント設定
 */
export const CommentConfigSchema = z.object({
  targetLength: z.object({
    min: z.number().min(1).max(100).default(20),
    max: z.number().min(20).max(200).default(60)
  }).refine(data => data.min <= data.max, {
    message: 'min must be less than or equal to max'
  }),
  tone: z.string().default('friendly'),
  characterPersona: z.string().default('好奇心旺盛な初心者'),
  encouragedExpressions: z.array(z.string()).default(['なるほど', 'すごい']),
  ngWords: z.array(z.string()).default([]),
  emojiPolicy: z.object({
    enabled: z.boolean().default(true),
    maxCount: z.number().min(0).max(5).default(1),
    allowedEmojis: z.array(z.string()).default(['👏', '✨', '🙏', '💡'])
  })
});

export type CommentConfig = z.infer<typeof CommentConfigSchema>;

/**
 * 安全設定
 */
export const SafetyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  level: SafetyLevelSchema.default('standard'),
  blockOnUncertainty: z.boolean().default(true),
  moderationThresholds: z.object({
    hate: z.number().min(0).max(1).default(0.7),
    harassment: z.number().min(0).max(1).default(0.7),
    selfHarm: z.number().min(0).max(1).default(0.8),
    sexual: z.number().min(0).max(1).default(0.7),
    violence: z.number().min(0).max(1).default(0.7),
    illegal: z.number().min(0).max(1).default(0.8),
    graphic: z.number().min(0).max(1).default(0.8)
  })
});

export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;

/**
 * レート制限設定
 */
export const RateLimitConfigSchema = z.object({
  messagesPerWindow: z.number().min(1).max(50).default(30),
  windowSeconds: z.number().min(10).max(300).default(30),
  minIntervalSeconds: z.number().min(1).max(60).default(2)
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/**
 * アプリケーション設定全体
 */
export const AppConfigSchema = z.object({
  providers: ProviderConfigSchema,
  comment: CommentConfigSchema,
  safety: SafetyConfigSchema,
  rateLimit: RateLimitConfigSchema,
  youtube: z.object({
    videoId: z.string().optional(),
    liveChatId: z.string().optional()
  }).default({})
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * デフォルト設定
 */
export const DEFAULT_CONFIG: AppConfig = {
  providers: {
    stt: {
      primary: 'deepgram',
      fallback: ['gcp', 'whisper']
    },
    llm: {
      primary: 'openai',
      model: 'gpt-4o-mini'
    },
    moderation: ['openai_moderation', 'rule_based']
  },
  comment: {
    targetLength: {
      min: 20,
      max: 60
    },
    tone: 'friendly',
    characterPersona: '好奇心旺盛な初心者',
    encouragedExpressions: ['なるほど', 'すごい'],
    ngWords: [],
    emojiPolicy: {
      enabled: true,
      maxCount: 1,
      allowedEmojis: ['👏', '✨', '🙏', '💡']
    }
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
      graphic: 0.8
    }
  },
  rateLimit: {
    messagesPerWindow: 30,
    windowSeconds: 30,
    minIntervalSeconds: 2
  },
  youtube: {}
};

/**
 * プロバイダ設定の拡張型（優先順位付き）
 */
export interface ProviderConfigWithPriority {
  primary: string;
  fallback: string[];
  priority: string[];
  model?: string;
}
