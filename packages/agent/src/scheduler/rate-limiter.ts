/**
 * レート制限管理
 * コメント投稿の頻度を制御する
 */

export interface RateLimiterConfig {
  /** 最小投稿間隔（秒） */
  minIntervalSeconds: number;
  /** 10分間の最大投稿数 */
  maxPer10Minutes: number;
  /** クールダウン期間（秒） */
  cooldownSeconds: number;
  /** 重複検出ウィンドウ（秒） */
  dedupeWindowSeconds: number;
}

export interface RateLimitResult {
  /** 投稿が許可されたか */
  allowed: boolean;
  /** 拒否理由 */
  reason?: 'min_interval' | 'rate_limit' | 'cooldown' | 'duplicate' | 'invalid';
  /** 再試行までの秒数 */
  retryAfter?: number;
}

export interface RateLimiterStats {
  /** 総試行回数 */
  totalAttempts: number;
  /** 許可された回数 */
  totalAllowed: number;
  /** 拒否された回数 */
  totalRejected: number;
  /** 拒否理由の内訳 */
  rejectionReasons: Record<string, number>;
  /** 現在のウィンドウ内のカウント */
  currentWindowCount: number;
  /** クールダウン中か */
  isInCooldown: boolean;
}

interface CommentRecord {
  /** コメントテキスト（正規化済み） */
  normalizedText: string;
  /** 投稿時刻 */
  timestamp: number;
}

export class RateLimiter {
  private config: RateLimiterConfig;
  private history: CommentRecord[] = [];
  private lastCommentTime: number = 0;
  private cooldownUntil: number = 0;
  private stats: RateLimiterStats = {
    totalAttempts: 0,
    totalAllowed: 0,
    totalRejected: 0,
    rejectionReasons: {},
    currentWindowCount: 0,
    isInCooldown: false,
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: RateLimiterConfig, disableAutoCleanup = false) {
    this.config = config;
    
    // 定期的に古い履歴をクリーンアップ（テスト時は無効化可能）
    if (!disableAutoCleanup) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupHistory();
      }, 60000); // 1分ごと
    }
  }

  /**
   * コメント投稿の制限をチェック
   */
  async checkLimit(comment: string): Promise<RateLimitResult> {
    this.stats.totalAttempts++;
    const now = Date.now();

    // 入力検証
    if (!comment || !comment.trim()) {
      this.incrementRejection('invalid');
      return {
        allowed: false,
        reason: 'invalid',
      };
    }

    // 重複チェック（最小間隔より先にチェック）
    const normalizedText = this.normalizeText(comment);
    const dedupeWindow = now - (this.config.dedupeWindowSeconds * 1000);
    const isDuplicate = this.history.some(
      record => record.timestamp > dedupeWindow && record.normalizedText === normalizedText
    );

    if (isDuplicate) {
      this.incrementRejection('duplicate');
      return {
        allowed: false,
        reason: 'duplicate',
      };
    }

    // クールダウンチェック
    if (now < this.cooldownUntil) {
      const retryAfter = Math.ceil((this.cooldownUntil - now) / 1000);
      this.incrementRejection('cooldown');
      return {
        allowed: false,
        reason: 'cooldown',
        retryAfter,
      };
    }

    // 最小間隔チェック
    if (this.lastCommentTime > 0) {
      const elapsed = (now - this.lastCommentTime) / 1000;
      if (elapsed < this.config.minIntervalSeconds) {
        const retryAfter = Math.ceil(this.config.minIntervalSeconds - elapsed);
        this.incrementRejection('min_interval');
        return {
          allowed: false,
          reason: 'min_interval',
          retryAfter,
        };
      }
    }

    // 10分間のレート制限チェック
    const rateWindow = now - (10 * 60 * 1000); // 10分
    const recentComments = this.history.filter(record => record.timestamp > rateWindow);
    
    if (recentComments.length >= this.config.maxPer10Minutes) {
      // 最も古いコメントが窓から出るまでの時間を計算
      const oldestInWindow = recentComments[0];
      const retryAfter = oldestInWindow ? 
        Math.ceil((oldestInWindow.timestamp + (10 * 60 * 1000) - now) / 1000) : 
        60;
      
      this.incrementRejection('rate_limit');
      return {
        allowed: false,
        reason: 'rate_limit',
        retryAfter,
      };
    }

    // 投稿を記録
    this.history.push({
      normalizedText,
      timestamp: now,
    });
    this.lastCommentTime = now;
    this.stats.totalAllowed++;
    this.stats.currentWindowCount = recentComments.length + 1;

    // 連続投稿チェック（記録後にチェック、次回のためのクールダウン設定）
    const recentBurst = this.history
      .filter(record => record.timestamp > now - 60000) // 1分以内
      .length;
    
    if (recentBurst >= 3) {
      this.cooldownUntil = now + (this.config.cooldownSeconds * 1000);
      this.stats.isInCooldown = true;
    }

    return {
      allowed: true,
    };
  }

  /**
   * テキストを正規化（重複検出用）
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ') // 複数のスペースを1つに
      .replace(/[！!]+/g, '!') // 感嘆符の正規化
      .replace(/[？?]+/g, '?') // 疑問符の正規化
      .replace(/[　]+/g, ' '); // 全角スペースを半角に
  }

  /**
   * 古い履歴を削除
   */
  private cleanupHistory(): void {
    const now = Date.now();
    const keepAfter = Math.min(
      now - (10 * 60 * 1000), // 10分
      now - (this.config.dedupeWindowSeconds * 1000)
    );

    this.history = this.history.filter(record => record.timestamp > keepAfter);
    
    // クールダウン状態の更新
    if (now >= this.cooldownUntil) {
      this.stats.isInCooldown = false;
    }

    // 現在のウィンドウカウントを更新
    const rateWindow = now - (10 * 60 * 1000);
    this.stats.currentWindowCount = this.history.filter(
      record => record.timestamp > rateWindow
    ).length;
  }

  /**
   * 拒否理由をカウント
   */
  private incrementRejection(reason: string): void {
    this.stats.totalRejected++;
    this.stats.rejectionReasons[reason] = (this.stats.rejectionReasons[reason] || 0) + 1;
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): RateLimiterStats {
    return { ...this.stats };
  }

  /**
   * 履歴をクリア
   */
  clearHistory(): void {
    this.history = [];
    this.lastCommentTime = 0;
    this.cooldownUntil = 0;
    this.stats = {
      totalAttempts: 0,
      totalAllowed: 0,
      totalRejected: 0,
      rejectionReasons: {},
      currentWindowCount: 0,
      isInCooldown: false,
    };
  }

  /**
   * 設定を更新
   */
  updateConfig(config: RateLimiterConfig): void {
    this.config = config;
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }

  /**
   * クリーンアップ
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}
