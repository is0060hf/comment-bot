/**
 * 共有型定義 - アプリケーション設定とデータモデル
 */

import { z } from 'zod';

// 基本的な列挙型
export const SafetyLevelSchema = z.enum(['strict', 'standard', 'relaxed']);
export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

export const CommentToneSchema = z.enum(['friendly', 'formal', 'casual', 'enthusiastic']);
export type CommentTone = z.infer<typeof CommentToneSchema>;

export const ModerationCategorySchema = z.enum([
  'hate',
  'harassment',
  'selfHarm',
  'sexual',
  'violence',
  'illegal',
  'graphic',
]);
export type ModerationCategory = z.infer<typeof ModerationCategorySchema>;

export const CommentClassificationSchema = z.enum(['necessary', 'optional', 'unnecessary']);
export type CommentClassification = z.infer<typeof CommentClassificationSchema>;

// プロバイダー設定
export const STTProviderConfigSchema = z.object({
  primary: z.enum(['deepgram', 'gcp', 'whisper']),
  fallback: z.array(z.enum(['deepgram', 'gcp', 'whisper'])).optional(),
  deepgram: z
    .object({
      apiKey: z.string(),
      model: z.string().default('nova-2'),
      language: z.string().default('ja'),
    })
    .optional(),
  gcp: z
    .object({
      keyFilePath: z.string(),
      model: z.string().default('latest_long'),
      language: z.string().default('ja-JP'),
    })
    .optional(),
  whisper: z
    .object({
      apiKey: z.string(),
      model: z.string().default('whisper-1'),
      language: z.string().default('ja'),
    })
    .optional(),
});

export const LLMProviderConfigSchema = z.object({
  primary: z.enum(['openai']),
  fallback: z.array(z.enum(['openai'])).optional(),
  openai: z
    .object({
      apiKey: z.string(),
      model: z.string().default('gpt-4o-mini'),
      maxTokens: z.number().optional(),
      temperature: z.number().min(0).max(2).default(0.7),
    })
    .optional(),
});

export const ModerationProviderConfigSchema = z.object({
  primary: z.enum(['openai', 'rule_based']),
  fallback: z.array(z.enum(['openai', 'rule_based'])).optional(),
});

// コメント設定
export const CommentConfigSchema = z.object({
  targetLength: z
    .object({
      min: z.number().min(1).default(20),
      max: z.number().min(1).default(60),
    })
    .default({ min: 20, max: 60 }),
  tone: CommentToneSchema.default('friendly'),
  characterPersona: z.string().default('好奇心旺盛な初心者'),
  encouragedExpressions: z.array(z.string()).default(['なるほど', 'すごい']),
  ngWords: z.array(z.string()).default([]),
  emojiPolicy: z
    .object({
      enabled: z.boolean().default(true),
      maxCount: z.number().min(0).default(1),
      allowedEmojis: z.array(z.string()).default(['👏', '✨', '🙏', '💡']),
    })
    .default({
      enabled: true,
      maxCount: 1,
      allowedEmojis: ['👏', '✨', '🙏', '💡'],
    }),
});

// 安全設定
export const SafetyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  level: SafetyLevelSchema.default('standard'),
  blockOnUncertainty: z.boolean().default(true),
  moderationThresholds: z
    .object({
      hate: z.number().min(0).max(1).default(0.7),
      harassment: z.number().min(0).max(1).default(0.7),
      selfHarm: z.number().min(0).max(1).default(0.8),
      sexual: z.number().min(0).max(1).default(0.7),
      violence: z.number().min(0).max(1).default(0.7),
      illegal: z.number().min(0).max(1).default(0.8),
      graphic: z.number().min(0).max(1).default(0.8),
    })
    .default({}),
});

// YouTube設定
export const YouTubeConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  refreshToken: z.string().optional(),
  rateLimits: z
    .object({
      messagesPerMinute: z.number().min(1).default(20),
      messagesPerHour: z.number().min(1).default(200),
      minInterval: z.number().min(0).default(5),
      cooldownSeconds: z.number().min(0).default(10),
    })
    .default({}),
});

// ストリーム設定
export const StreamConfigSchema = z.object({
  audioDevice: z.string().default('BlackHole 2ch'),
  bufferSize: z.number().min(64).default(1024),
  sampleRate: z.number().default(16000),
  channels: z.number().min(1).max(2).default(1),
});

// アプリケーション設定全体
export const AppConfigSchema = z.object({
  providers: z
    .object({
      stt: STTProviderConfigSchema,
      llm: LLMProviderConfigSchema,
      moderation: ModerationProviderConfigSchema,
    })
    .default({
      stt: { primary: 'deepgram' },
      llm: { primary: 'openai' },
      moderation: { primary: 'openai', fallback: ['rule_based'] },
    }),
  comment: CommentConfigSchema.default({
    targetLength: { min: 20, max: 60 },
    tone: 'friendly',
    characterPersona: '好奇心旺盛な初心者',
    encouragedExpressions: ['なるほど', 'すごい'],
    ngWords: [],
    emojiPolicy: {
      enabled: true,
      maxCount: 1,
      allowedEmojis: ['👏', '✨', '🙏', '💡'],
    },
  }),
  safety: SafetyConfigSchema.default({
    enabled: true,
    level: 'standard',
    blockOnUncertainty: true,
    moderationThresholds: {},
  }),
  youtube: YouTubeConfigSchema.optional(),
  stream: StreamConfigSchema.default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// 音声認識結果
export const TranscriptSegmentSchema = z.object({
  text: z.string(),
  timestamp: z.number(),
  confidence: z.number().min(0).max(1),
  isFinal: z.boolean(),
  language: z.string().optional(),
  speaker: z.string().optional(),
});

export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

// コンテキストサマリー
export const ContextSummarySchema = z.object({
  recentTranscripts: z.array(z.string()),
  topics: z.array(z.string()),
  keywords: z.array(z.string()),
  engagementLevel: z.number().min(0).max(1),
  lastCommentTime: z.number().optional(),
  viewerQuestions: z.array(z.string()).optional(),
});

export type ContextSummary = z.infer<typeof ContextSummarySchema>;

// コメント生成コンテキスト
export const CommentGenerationContextSchema = z.object({
  currentTranscript: z.string(),
  recentTranscripts: z.array(z.string()),
  recentTopics: z.array(z.string()),
  keywords: z.array(z.string()),
  recentComments: z.array(z.string()),
  streamTitle: z.string(),
  streamContext: z.object({
    title: z.string(),
    description: z.string().optional(),
    viewerCount: z.number().optional(),
  }),
  policy: z.object({
    targetLength: z.object({
      min: z.number(),
      max: z.number(),
    }),
    tone: CommentToneSchema,
    characterPersona: z.string(),
    encouragedExpressions: z.array(z.string()),
  }),
});

export type CommentGenerationContext = z.infer<typeof CommentGenerationContextSchema>;

// コメント分類結果
export const CommentClassificationResultSchema = z.object({
  classification: CommentClassificationSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  suggestedDelay: z.number().optional(),
});

export type CommentClassificationResult = z.infer<typeof CommentClassificationResultSchema>;

// モデレーション結果
export const ModerationResultSchema = z.object({
  flagged: z.boolean(),
  categories: z.record(ModerationCategorySchema, z.boolean()),
  scores: z.record(ModerationCategorySchema, z.number()),
  requiresRewrite: z.boolean().optional(),
  suggestedAction: z.enum(['block', 'rewrite', 'pass']).optional(),
  error: z.string().optional(),
});

export type ModerationResult = z.infer<typeof ModerationResultSchema>;

// 投稿結果
export const PostResultSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  timestamp: z.number().optional(),
  comment: z.string().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryAfter: z.number().optional(),
    })
    .optional(),
});

export type PostResult = z.infer<typeof PostResultSchema>;
