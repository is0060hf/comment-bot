import {
  ModerationPort,
  ModerationResult,
  ModerationError,
  ModerationCategory,
  RewriteResult,
} from '../../ports/moderation';

/**
 * MockModerationアダプタの設定
 */
export interface MockModerationConfig {
  /** 失敗率 (0-1) */
  failureRate?: number;
  /** ヘルスチェックの状態 */
  healthy?: boolean;
  /** フラグする確率 */
  flagProbability?: number;
  /** リライト提案する確率 */
  rewriteProbability?: number;
  /** 必ず失敗するかどうか（テスト用） */
  shouldFail?: boolean;
  /** ヘルスチェックの結果（テスト用） */
  isHealthy?: boolean;
  /** 不適切なパターン */
  inappropriatePatterns?: string[];
}

/**
 * テスト用のModerationモックアダプタ
 */
export class MockModerationAdapter implements ModerationPort {
  private readonly config: Required<MockModerationConfig>;

  // テスト用の不適切キーワード
  private inappropriatePatterns = [
    { pattern: /\[暴力/, category: 'violence' as ModerationCategory, score: 0.8 },
    { pattern: /\[ハラスメント/, category: 'harassment' as ModerationCategory, score: 0.75 },
    { pattern: /\[不適切/, category: 'hate' as ModerationCategory, score: 0.7 },
    { pattern: /\[性的/, category: 'sexual' as ModerationCategory, score: 0.85 },
  ];

  constructor(config: MockModerationConfig = {}) {
    this.config = {
      failureRate: config.failureRate ?? 0,
      healthy: config.healthy ?? true,
      flagProbability: config.flagProbability ?? 0.1,
      rewriteProbability: config.rewriteProbability ?? 0.2,
      shouldFail: config.shouldFail ?? false,
      isHealthy: config.isHealthy ?? true,
      inappropriatePatterns: config.inappropriatePatterns ?? [],
    };

    // カスタム不適切パターンを追加
    if (config.inappropriatePatterns) {
      config.inappropriatePatterns.forEach((pattern) => {
        this.inappropriatePatterns.push({
          pattern: new RegExp(pattern),
          category: 'hate' as ModerationCategory,
          score: 0.9,
        });
      });
    }
  }

  async moderate(content: string, _context?: Record<string, unknown>): Promise<ModerationResult> {
    // モックレイテンシをシミュレート（1-10ms）
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 10 + 1));

    // 必ず失敗フラグが立っている場合
    if (this.config.shouldFail) {
      throw new ModerationError('Mock moderation service failure', 'MOCK_MODERATION_ERROR', true);
    }

    // 失敗シミュレーション
    if (Math.random() < this.config.failureRate) {
      throw new ModerationError('Mock moderation service failure', 'MOCK_MODERATION_ERROR', true);
    }

    // 空コンテンツは安全
    if (!content || content.trim() === '') {
      return {
        flagged: false,
        categories: {},
        scores: {},
        requiresRewrite: false,
        suggestedAction: 'pass',
      };
    }

    // パターンマッチングで不適切コンテンツを検出
    const categories: Partial<Record<ModerationCategory, boolean>> = {};
    const scores: Partial<Record<ModerationCategory, number>> = {};
    let flagged = false;
    let maxScore = 0;

    for (const { pattern, category, score } of this.inappropriatePatterns) {
      if (pattern.test(content)) {
        categories[category] = true;
        scores[category] = score;
        flagged = true;
        maxScore = Math.max(maxScore, score);
      }
    }

    // ランダムな軽度の問題検出
    const requiresRewrite = !flagged && content.includes('[軽度');

    // 推奨アクションの決定
    let suggestedAction: 'block' | 'rewrite' | 'pass';
    if (flagged && maxScore > 0.7) {
      suggestedAction = 'block';
    } else if (flagged || requiresRewrite) {
      suggestedAction = 'rewrite';
    } else {
      suggestedAction = 'pass';
    }

    return {
      flagged,
      categories,
      scores,
      requiresRewrite,
      suggestedAction,
    };
  }

  async moderateBatch(contents: string[]): Promise<ModerationResult[]> {
    // 失敗シミュレーション
    if (Math.random() < this.config.failureRate) {
      throw new ModerationError('Mock moderation batch failure', 'MOCK_MODERATION_ERROR', true);
    }

    return Promise.all(contents.map((content) => this.moderate(content)));
  }

  async rewriteContent(content: string, _guidelines?: string[]): Promise<RewriteResult> {
    // 失敗シミュレーション
    if (Math.random() < this.config.failureRate) {
      throw new ModerationError('Mock rewrite failure', 'MOCK_MODERATION_ERROR', true);
    }

    // 安全なコンテンツはそのまま返す
    const moderationResult = await this.moderate(content);
    if (!moderationResult.flagged && !moderationResult.requiresRewrite) {
      return {
        rewritten: false,
        rewrittenContent: content,
        changes: 0,
        reasons: [],
      };
    }

    // 簡易的なリライト
    let rewritten = content;
    const reasons: string[] = [];
    let changes = 0;

    // 不適切なパターンを置換
    for (const { pattern, category } of this.inappropriatePatterns) {
      if (pattern.test(rewritten)) {
        rewritten = rewritten.replace(pattern, '[適切な表現]');
        reasons.push(`${category}に関する表現を修正`);
        changes++;
      }
    }

    // 軽度の不適切表現も修正
    if (rewritten.includes('[軽度')) {
      rewritten = rewritten.replace(/\[軽度[^\]]*\]/g, '[適切な表現]');
      reasons.push('軽度の不適切表現を修正');
      changes++;
    }

    // その他の一般的な置換
    const replacements = [
      { from: '不適切', to: '適切', reason: '不適切な表現を修正' },
      { from: '微妙', to: '良い', reason: '曖昧な表現を改善' },
    ];

    for (const { from, to, reason } of replacements) {
      if (rewritten.includes(from)) {
        rewritten = rewritten.replace(new RegExp(from, 'g'), to);
        reasons.push(reason);
        changes++;
      }
    }

    return {
      rewritten: changes > 0,
      rewrittenContent: rewritten,
      changes,
      reasons,
    };
  }

  async isHealthy(): Promise<boolean> {
    return this.config.isHealthy ?? this.config.healthy;
  }
}
