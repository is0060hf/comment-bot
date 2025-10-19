/**
 * コメントスケジューラー
 * レート制限を考慮してコメントを順次処理する
 */

import { EventEmitter } from 'events';
import { RateLimiter } from './rate-limiter';

export interface ScheduledComment {
  /** コメントID */
  id: string;
  /** コメントテキスト */
  text: string;
  /** 優先度（高いほど優先） */
  priority: number;
  /** 追加時刻 */
  timestamp: number;
  /** リトライ回数 */
  retryCount?: number;
}

export interface SchedulerConfig {
  /** レート制限 */
  rateLimiter: RateLimiter;
  /** 最大キューサイズ */
  maxQueueSize: number;
  /** 処理間隔（ミリ秒） */
  processingIntervalMs: number;
  /** リトライ回数 */
  retryAttempts: number;
  /** リトライ間隔（ミリ秒） */
  retryDelayMs: number;
}

export interface EnqueueResult {
  /** 成功したか */
  success: boolean;
  /** キュー内の位置 */
  position?: number;
  /** キューサイズ */
  queueSize?: number;
  /** エラー理由 */
  error?: 'queue_full' | 'duplicate';
}

export interface SchedulerStatus {
  /** 実行中か */
  running: boolean;
  /** 一時停止中か */
  paused: boolean;
  /** キューサイズ */
  queueSize: number;
  /** 処理中か */
  processing: boolean;
  /** 処理済み数 */
  totalProcessed: number;
  /** 失敗数 */
  totalFailed: number;
}

interface ProcessingState {
  /** 現在処理中のコメント */
  current?: ScheduledComment;
  /** 処理タイマー */
  timer?: NodeJS.Timeout;
  /** リトライタイマー */
  retryTimer?: NodeJS.Timeout;
}

export class CommentScheduler extends EventEmitter {
  private config: SchedulerConfig;
  private queue: ScheduledComment[] = [];
  private running: boolean = false;
  private paused: boolean = false;
  private processing: ProcessingState = {};
  private stats = {
    totalProcessed: 0,
    totalFailed: 0,
  };

  constructor(config: SchedulerConfig) {
    super();
    this.config = config;
  }

  /**
   * コメントをキューに追加
   */
  enqueue(comment: ScheduledComment): EnqueueResult {
    // キューサイズチェック
    if (this.queue.length >= this.config.maxQueueSize) {
      return {
        success: false,
        error: 'queue_full',
      };
    }

    // 重複チェック（同じIDがキューにないか）
    if (this.queue.some(c => c.id === comment.id)) {
      return {
        success: false,
        error: 'duplicate',
      };
    }

    // キューに追加
    this.queue.push(comment);
    
    // 優先度順にソート（高い順）
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 同じ優先度なら古い順
      return a.timestamp - b.timestamp;
    });

    const position = this.queue.findIndex(c => c.id === comment.id) + 1;

    return {
      success: true,
      position,
      queueSize: this.queue.length,
    };
  }

  /**
   * キューから削除
   */
  removeFromQueue(commentId: string): boolean {
    const index = this.queue.findIndex(c => c.id === commentId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * キューをクリア
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * キューを取得
   */
  getQueue(): ReadonlyArray<ScheduledComment> {
    return [...this.queue];
  }

  /**
   * スケジューラーを開始
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.paused = false;
    this.scheduleNextProcess();
  }

  /**
   * スケジューラーを停止
   */
  stop(): void {
    this.running = false;
    this.paused = false;

    if (this.processing.timer) {
      clearTimeout(this.processing.timer);
      this.processing.timer = undefined;
    }

    if (this.processing.retryTimer) {
      clearTimeout(this.processing.retryTimer);
      this.processing.retryTimer = undefined;
    }

    this.processing.current = undefined;
  }

  /**
   * 一時停止
   */
  pause(): void {
    if (this.running) {
      this.paused = true;
    }
  }

  /**
   * 再開
   */
  resume(): void {
    if (this.running && this.paused) {
      this.paused = false;
      if (!this.processing.current) {
        this.scheduleNextProcess();
      }
    }
  }

  /**
   * 実行中か
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 一時停止中か
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * ステータスを取得
   */
  getStatus(): SchedulerStatus {
    return {
      running: this.running,
      paused: this.paused,
      queueSize: this.queue.length,
      processing: !!this.processing.current,
      totalProcessed: this.stats.totalProcessed,
      totalFailed: this.stats.totalFailed,
    };
  }

  /**
   * 次の処理をスケジュール
   */
  private scheduleNextProcess(): void {
    if (!this.running || this.paused || this.processing.current) {
      return;
    }

    this.processing.timer = setTimeout(() => {
      this.processNext();
    }, this.config.processingIntervalMs);
  }

  /**
   * 次のコメントを処理
   */
  private async processNext(): Promise<void> {
    if (!this.running || this.paused || this.queue.length === 0) {
      this.processing.current = undefined;
      if (this.running && !this.paused) {
        this.scheduleNextProcess();
      }
      return;
    }

    // キューから取り出し
    const comment = this.queue.shift();
    if (!comment) {
      this.scheduleNextProcess();
      return;
    }

    this.processing.current = comment;

    try {
      // レート制限チェック
      const result = await this.config.rateLimiter.checkLimit(comment.text);

      if (result.allowed) {
        // 成功
        this.stats.totalProcessed++;
        this.emit('processed', {
          comment,
          success: true,
          attempts: (comment.retryCount || 0) + 1,
        });

        this.processing.current = undefined;
        this.scheduleNextProcess();
      } else {
        // 失敗
        await this.handleRejection(comment, result.reason || 'unknown', result.retryAfter);
      }
    } catch (error) {
      // エラー
      this.emit('error', {
        error,
        comment,
      });

      this.stats.totalFailed++;
      this.emit('failed', {
        comment,
        reason: 'error',
        attempts: (comment.retryCount || 0) + 1,
      });

      this.processing.current = undefined;
      this.scheduleNextProcess();
    }
  }

  /**
   * 拒否されたコメントの処理
   */
  private async handleRejection(
    comment: ScheduledComment,
    reason: string,
    _retryAfter?: number
  ): Promise<void> {
    const retryCount = (comment.retryCount || 0) + 1;

    // 重複は即座に破棄
    if (reason === 'duplicate') {
      this.stats.totalFailed++;
      this.emit('failed', {
        comment,
        reason,
        attempts: retryCount,
      });

      this.processing.current = undefined;
      this.scheduleNextProcess();
      return;
    }

    // 最大リトライ回数チェック
    if (retryCount > this.config.retryAttempts) {
      this.stats.totalFailed++;
      this.emit('failed', {
        comment,
        reason: 'max_retries',
        attempts: retryCount,
      });

      this.processing.current = undefined;
      this.scheduleNextProcess();
      return;
    }

    // リトライのスケジュール
    comment.retryCount = retryCount;
    const delay = this.config.retryDelayMs;

    this.processing.retryTimer = setTimeout(() => {
      // キューの先頭に戻す
      this.queue.unshift(comment);
      this.processing.current = undefined;
      this.scheduleNextProcess();
    }, delay);
  }
}

