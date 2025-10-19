/**
 * 安全性チェッカー
 * コメントの安全性を確認
 */

import { ModerationManager } from '../core/moderation-manager';
import { SafetyConfig } from '../config/types';
import { ModerationCategory } from '../ports/moderation';
import { Logger, LogLevel } from '../logging/logger';

export interface SafetyCheckResult {
  isSafe: boolean;
  action: 'approve' | 'rewrite' | 'block' | 'approve_with_warning';
  reason?: string;
  flaggedCategories?: ModerationCategory[];
  rewrittenComment?: string;
  detectedPatterns?: string[];
  warning?: string;
  error?: Error;
}

export interface SafetyCheckerConfig {
  moderationManager: ModerationManager;
  safetyConfig: SafetyConfig;
}

export interface SafetyStatistics {
  totalChecks: number;
  approvedCount: number;
  blockedCount: number;
  rewrittenCount: number;
  flaggedCategories: Record<ModerationCategory, number>;
}

export class SafetyChecker {
  private moderationManager: ModerationManager;
  private config: SafetyConfig;
  private logger: Logger;
  private statistics: SafetyStatistics;
  private personalInfoRegexes: Map<string, RegExp>;

  constructor({ moderationManager, safetyConfig }: SafetyCheckerConfig) {
    this.moderationManager = moderationManager;
    this.config = safetyConfig;
    this.logger = new Logger({ level: LogLevel.INFO });
    
    this.statistics = {
      totalChecks: 0,
      approvedCount: 0,
      blockedCount: 0,
      rewrittenCount: 0,
      flaggedCategories: {} as Record<ModerationCategory, number>
    };

    // 個人情報パターンの正規表現を準備
    this.personalInfoRegexes = new Map([
      ['phone_number', /\d{3}-\d{4}-\d{4}/g],
      ['email', /[\w\.-]+@[\w\.-]+\.\w+/g],
      ['postal_code', /\d{3}-\d{4}/g]
    ]);
    
    // カスタムパターンを追加（将来の拡張用）
  }

  /**
   * 安全性をチェック
   */
  async check(comment: string): Promise<SafetyCheckResult> {
    this.statistics.totalChecks++;

    if (!this.config.enabled) {
      this.statistics.approvedCount++;
      return {
        isSafe: true,
        action: 'approve',
        reason: 'safety_check_disabled'
      };
    }

    // 個人情報チェック
    const piiResult = this.checkPersonalInfo(comment);
    if (!piiResult.isSafe) {
      this.statistics.blockedCount++;
      return piiResult;
    }

    try {
      // モデレーションチェック
      const moderationResult = await this.moderationManager.moderateWithThresholds(
        comment
      );

      // カテゴリごとの統計を更新
      moderationResult.flaggedCategories.forEach(category => {
        this.statistics.flaggedCategories[category] = 
          (this.statistics.flaggedCategories[category] || 0) + 1;
      });

      // アクションに基づいて処理
      switch (moderationResult.suggestedAction) {
        case 'approve':
          this.statistics.approvedCount++;
          return {
            isSafe: true,
            action: 'approve',
            flaggedCategories: moderationResult.flaggedCategories
          };

        case 'review':
          // レビューが必要な場合、安全レベルに応じて判断
          if (this.config.level === 'strict') {
            this.statistics.blockedCount++;
            return {
              isSafe: false,
              action: 'block',
              reason: 'strict_threshold_exceeded',
              flaggedCategories: moderationResult.flaggedCategories
            };
          }
          this.statistics.approvedCount++;
          return {
            isSafe: true,
            action: 'approve',
            flaggedCategories: moderationResult.flaggedCategories
          };

        case 'rewrite':
          // リライト試行
          const rewriteResult = await this.tryRewrite(comment);
          if (rewriteResult.isSafe) {
            this.statistics.rewrittenCount++;
            return rewriteResult;
          }
          this.statistics.blockedCount++;
          return rewriteResult;

        case 'block':
        default:
          this.statistics.blockedCount++;
          return {
            isSafe: false,
            action: 'block',
            reason: 'moderation_flagged',
            flaggedCategories: moderationResult.flaggedCategories
          };
      }

    } catch (error) {
      this.logger.error('Moderation check failed', error);
      
      if (this.config.blockOnUncertainty) {
        this.statistics.blockedCount++;
        return {
          isSafe: false,
          action: 'block',
          reason: 'moderation_error',
          error: error as Error
        };
      } else {
        this.statistics.approvedCount++;
        return {
          isSafe: true,
          action: 'approve_with_warning',
          warning: 'moderation_unavailable',
          error: error as Error
        };
      }
    }
  }

  /**
   * 個人情報をチェック
   */
  private checkPersonalInfo(comment: string): SafetyCheckResult {
    const detectedPatterns: string[] = [];

    for (const [name, regex] of this.personalInfoRegexes) {
      if (regex.test(comment)) {
        detectedPatterns.push(name);
      }
    }

    if (detectedPatterns.length > 0) {
      return {
        isSafe: false,
        action: 'block',
        reason: 'personal_info_detected',
        detectedPatterns
      };
    }

    return {
      isSafe: true,
      action: 'approve'
    };
  }

  /**
   * リライトを試行
   */
  private async tryRewrite(comment: string): Promise<SafetyCheckResult> {
    try {
      // ModerationManagerのrewriteメソッドを直接呼び出す
      const primaryAdapter = (this.moderationManager as any).primary;
      const rewriteResult = await primaryAdapter.rewriteContent(
        comment,
        'Remove any offensive or inappropriate content while preserving the positive intent'
      );

      if (!rewriteResult.wasRewritten) {
        return {
          isSafe: false,
          action: 'block',
          reason: 'rewrite_not_needed_but_flagged'
        };
      }

      // リライト後の再チェック
      const recheckResult = await this.moderationManager.moderateWithThresholds(
        rewriteResult.rewritten
      );

      if (recheckResult.suggestedAction === 'approve') {
        return {
          isSafe: true,
          action: 'rewrite',
          rewrittenComment: rewriteResult.rewritten,
          flaggedCategories: recheckResult.flaggedCategories
        };
      } else {
        return {
          isSafe: false,
          action: 'block',
          reason: 'rewrite_still_unsafe',
          flaggedCategories: recheckResult.flaggedCategories
        };
      }

    } catch (error) {
      this.logger.error('Rewrite failed', error);
      return {
        isSafe: false,
        action: 'block',
        reason: 'rewrite_failed',
        error: error as Error
      };
    }
  }

  /**
   * 個人情報を除去
   */
  async removePII(comment: string): Promise<string> {
    let sanitized = comment;

    for (const [, regex] of this.personalInfoRegexes) {
      sanitized = sanitized.replace(regex, '[個人情報]');
    }

    return sanitized;
  }

  // _getThresholdsForLevel メソッドは現在使用されていないため削除
  // 将来的にレベル別の閾値調整が必要になった場合は再実装する

  /**
   * 統計情報を取得
   */
  getStatistics(): SafetyStatistics {
    return { ...this.statistics };
  }

  /**
   * 設定を更新
   */
  updateConfig(config: SafetyConfig): void {
    this.config = config;
    
    // Note: personalInfoPatterns is managed internally by SafetyChecker
    // and not exposed through SafetyConfig
  }
}
