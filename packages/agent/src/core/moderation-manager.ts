import { SafetyConfig } from '../config/types';
import { ModerationPort, ModerationResult, ModerationCategory } from '../ports/moderation';

/**
 * モデレーションマネージャーの設定
 */
export interface ModerationManagerConfig {
  primary: ModerationPort;
  fallback: ModerationPort;
  config: SafetyConfig;
}

/**
 * 閾値設定
 */
export interface ModerationThresholds {
  hate?: number;
  harassment?: number;
  sexual?: number;
  violence?: number;
  selfHarm?: number;
  illegal?: number;
  graphic?: number;
}

/**
 * ヘルスステータス
 */
export interface HealthStatus {
  primary: {
    healthy: boolean;
    lastChecked: Date;
    error?: string;
  };
  fallback: {
    healthy: boolean;
    lastChecked: Date;
    error?: string;
  };
}

/**
 * モデレーション統計
 */
export interface ModerationStatistics {
  totalRequests: number;
  flaggedCount: number;
  primaryFailures: number;
  fallbackUsage: number;
  averageLatency: number;
}

/**
 * リライト結果
 */
export interface ModerationAndRewriteResult {
  originalFlagged: boolean;
  rewritten: boolean;
  rewrittenContent?: string;
  rewrittenFlagged?: boolean;
  error?: string;
}

/**
 * モデレーション管理クラス
 * 複数のモデレーションサービスの管理と閾値ベースの判定を行う
 */
export class ModerationManager {
  private primary: ModerationPort;
  private fallback: ModerationPort;
  private config: SafetyConfig;
  private customThresholds?: ModerationThresholds;

  // 統計情報
  private stats: ModerationStatistics = {
    totalRequests: 0,
    flaggedCount: 0,
    primaryFailures: 0,
    fallbackUsage: 0,
    averageLatency: 0,
  };

  // ヘルス情報
  private healthStatus: HealthStatus = {
    primary: { healthy: true, lastChecked: new Date() },
    fallback: { healthy: true, lastChecked: new Date() },
  };

  constructor(config: ModerationManagerConfig) {
    this.primary = config.primary;
    this.fallback = config.fallback;
    this.config = config.config;
  }

  /**
   * 閾値ベースでコンテンツをモデレート
   */
  async moderateWithThresholds(
    content: string,
    context?: string
  ): Promise<ModerationResult> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      // プライマリアダプタで試行
      const result = await this.primary.moderate(content, context);

      // 閾値に基づいて再評価
      const adjustedResult = this.applyThresholds(result);

      if (adjustedResult.flagged) {
        this.stats.flaggedCount++;
      }

      this.updateLatency(Date.now() - startTime);
      return adjustedResult;
    } catch (primaryError) {
      this.stats.primaryFailures++;
      console.error('Primary moderation failed:', primaryError);

      try {
        // フォールバックアダプタで試行
        this.stats.fallbackUsage++;
        const result = await this.fallback.moderate(content, context);

        const adjustedResult = this.applyThresholds(result);

        if (adjustedResult.flagged) {
          this.stats.flaggedCount++;
        }

        this.updateLatency(Date.now() - startTime);
        return adjustedResult;
      } catch (fallbackError) {
        console.error('Fallback moderation also failed:', fallbackError);

        // 両方失敗した場合
        this.updateLatency(Date.now() - startTime);

        return {
          flagged: this.config.blockOnUncertainty,
          scores: {
            hate: 0,
            harassment: 0,
            selfHarm: 0,
            sexual: 0,
            violence: 0,
            illegal: 0,
            graphic: 0,
          },
          flaggedCategories: [],
          suggestedAction: this.config.blockOnUncertainty ? 'block' : 'approve',
          error: 'All moderation services failed',
        };
      }
    }
  }

  /**
   * 複数のコンテンツを一括モデレート
   */
  async moderateBatch(contents: string[]): Promise<ModerationResult[]> {
    try {
      // プライマリアダプタがバッチ対応の場合
      const results = await this.primary.moderateBatch(contents);
      return results.map((result) => this.applyThresholds(result));
    } catch (error) {
      // フォールバックまたは個別処理
      return Promise.all(contents.map((content) => this.moderateWithThresholds(content)));
    }
  }

  /**
   * コンテンツをモデレートし、必要に応じてリライト
   */
  async moderateAndRewrite(
    content: string,
    guidelines: string = 'Keep the content safe and appropriate'
  ): Promise<ModerationAndRewriteResult> {
    // まずモデレート
    const moderationResult = await this.moderateWithThresholds(content);

    const result: ModerationAndRewriteResult = {
      originalFlagged: moderationResult.flagged,
      rewritten: false,
    };

    // フラグされていない場合はそのまま返す
    if (!moderationResult.flagged) {
      return result;
    }

    // リライトを試行
    try {
      const rewriteResult = await this.primary.rewriteContent(content, guidelines);

      if (rewriteResult.wasRewritten) {
        result.rewritten = true;
        result.rewrittenContent = rewriteResult.rewritten;

        // リライト後のコンテンツも検証
        const rewrittenModeration = await this.moderateWithThresholds(
          rewriteResult.rewritten
        );
        result.rewrittenFlagged = rewrittenModeration.flagged;
      }
    } catch (error) {
      result.error = 'Rewriting failed';
    }

    return result;
  }

  /**
   * 現在の閾値を取得
   */
  getThresholds(): Required<ModerationThresholds> {
    if (this.customThresholds) {
      return this.mergeThresholds(this.getDefaultThresholds(), this.customThresholds);
    }
    return this.getDefaultThresholds();
  }

  /**
   * カスタム閾値を設定
   */
  setCustomThresholds(thresholds: ModerationThresholds): void {
    this.customThresholds = thresholds;
  }

  /**
   * 設定を更新
   */
  updateConfig(config: SafetyConfig): void {
    this.config = config;
  }

  /**
   * ヘルスステータスを取得
   */
  async getHealthStatus(): Promise<HealthStatus> {
    // プライマリのヘルスチェック
    try {
      const primaryHealthy = await this.primary.isHealthy();
      this.healthStatus.primary = {
        healthy: primaryHealthy,
        lastChecked: new Date(),
      };
    } catch (error) {
      this.healthStatus.primary = {
        healthy: false,
        lastChecked: new Date(),
        error: String(error),
      };
    }

    // フォールバックのヘルスチェック
    try {
      const fallbackHealthy = await this.fallback.isHealthy();
      this.healthStatus.fallback = {
        healthy: fallbackHealthy,
        lastChecked: new Date(),
      };
    } catch (error) {
      this.healthStatus.fallback = {
        healthy: false,
        lastChecked: new Date(),
        error: String(error),
      };
    }

    return { ...this.healthStatus };
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): ModerationStatistics {
    return { ...this.stats };
  }

  /**
   * 閾値を適用してモデレーション結果を調整
   */
  private applyThresholds(result: ModerationResult): ModerationResult {
    const thresholds = this.getThresholds();
    const adjustedCategories: ModerationCategory[] = [];
    let flagged = false;

    if (result.scores) {
      for (const [category, score] of Object.entries(result.scores)) {
        const threshold = thresholds[category as keyof ModerationThresholds];
        if (threshold !== undefined && score >= threshold) {
          // Map string to ModerationCategory enum
          const enumKey = category === 'selfHarm' ? 'SELF_HARM' : category.toUpperCase();
          const categoryEnum = ModerationCategory[enumKey as keyof typeof ModerationCategory];
          if (categoryEnum) {
            adjustedCategories.push(categoryEnum);
          }
          flagged = true;
        }
      }
    }

    // Determine suggestedAction based on flagged status
    let suggestedAction = result.suggestedAction;
    if (!suggestedAction) {
      if (flagged || result.flagged) {
        // If severely flagged, suggest block
        const maxScore = Math.max(...Object.values(result.scores || {}));
        if (maxScore >= 0.8) {
          suggestedAction = 'block';
        } else if (maxScore >= 0.6) {
          suggestedAction = 'rewrite';
        } else {
          suggestedAction = 'review';
        }
      } else {
        suggestedAction = 'approve';
      }
    }

    return {
      ...result,
      flagged: flagged || result.flagged,
      flaggedCategories:
        adjustedCategories.length > 0 ? adjustedCategories : result.flaggedCategories,
      suggestedAction,
    };
  }

  /**
   * デフォルト閾値を取得
   */
  private getDefaultThresholds(): Required<ModerationThresholds> {
    const baseThresholds = {
      hate: 0.7,
      harassment: 0.7,
      sexual: 0.7,
      violence: 0.7,
      selfHarm: 0.8,
      illegal: 0.8,
      graphic: 0.8,
    };

    // セーフティレベルに応じて調整
    switch (this.config.level) {
      case 'strict':
        return Object.fromEntries(
          Object.entries(baseThresholds).map(([key, value]) => [key, value - 0.2])
        ) as Required<ModerationThresholds>;

      case 'relaxed':
        return Object.fromEntries(
          Object.entries(baseThresholds).map(([key, value]) => [key, Math.min(0.9, value + 0.2)])
        ) as Required<ModerationThresholds>;

      default: // standard
        return baseThresholds;
    }
  }

  /**
   * 閾値をマージ
   */
  private mergeThresholds(
    base: Required<ModerationThresholds>,
    custom: ModerationThresholds
  ): Required<ModerationThresholds> {
    return {
      ...base,
      ...Object.fromEntries(Object.entries(custom).filter(([_, value]) => value !== undefined)),
    } as Required<ModerationThresholds>;
  }

  /**
   * レイテンシ統計を更新
   */
  private updateLatency(latency: number): void {
    if (this.stats.totalRequests === 1) {
      this.stats.averageLatency = latency;
    } else {
      const currentTotal = this.stats.averageLatency * (this.stats.totalRequests - 1);
      this.stats.averageLatency = (currentTotal + latency) / this.stats.totalRequests;
    }
  }
}
