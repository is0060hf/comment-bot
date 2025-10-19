/**
 * 共有型定義
 * Agent/Web間で共有される型定義
 */

import { z } from 'zod';

// 既存の型定義を再エクスポート
export {
  TranscriptSegmentSchema,
  ContextSummarySchema,
  ModerationResultSchema,
  PostResultSchema,
  type TranscriptSegment,
  type ContextSummary,
  type ModerationResult,
  type PostResult,
} from './app-config';

/**
 * コメントトリガー判定
 */
export const TriggerDecisionSchema = z.object({
  shouldComment: z.boolean(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  triggerType: z.enum(['question', 'topic_change', 'call_to_action', 'timing', 'manual', 'none']),
  context: z.object({
    recentTranscript: z.string(),
    detectedIntent: z.string(),
  }).optional(),
});

export type TriggerDecision = z.infer<typeof TriggerDecisionSchema>;

/**
 * 生成されたコメント
 */
export const GeneratedCommentSchema = z.object({
  text: z.string(),
  metadata: z.object({
    tone: z.string(),
    intent: z.string(),
    confidence: z.number().min(0).max(1),
    generatedAt: z.date(),
  }),
  alternatives: z.array(z.string()).default([]),
});

export type GeneratedComment = z.infer<typeof GeneratedCommentSchema>;

/**
 * API レスポンス型
 */
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).optional(),
});

export type ApiResponse<T = unknown> = Omit<z.infer<typeof ApiResponseSchema>, 'data'> & {
  data?: T;
};

/**
 * WebSocket メッセージ型
 */
export const WebSocketMessageSchema = z.object({
  type: z.enum(['status', 'transcript', 'comment', 'error', 'config_update']),
  payload: z.unknown(),
  timestamp: z.date(),
});

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

/**
 * エージェント状態
 */
export const AgentStatusSchema = z.object({
  running: z.boolean(),
  paused: z.boolean(),
  liveChatId: z.string().optional(),
  startedAt: z.date().optional(),
  statistics: z.object({
    transcriptsProcessed: z.number(),
    commentsGenerated: z.number(),
    commentsPosted: z.number(),
    errorsCount: z.number(),
  }).optional(),
});

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/**
 * 設定更新リクエスト
 */
export const ConfigUpdateRequestSchema = z.object({
  section: z.enum(['comment', 'safety', 'rateLimit', 'providers']),
  updates: z.record(z.unknown()),
  timestamp: z.date(),
});

export type ConfigUpdateRequest = z.infer<typeof ConfigUpdateRequestSchema>;

/**
 * エラー詳細
 */
export const ErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  stack: z.string().optional(),
  timestamp: z.date(),
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
