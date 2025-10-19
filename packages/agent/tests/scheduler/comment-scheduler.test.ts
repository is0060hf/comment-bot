/**
 * Tsumiki AITDD - Red Phase
 * タスク8: コメントスケジューラーのテストケース
 */

import { CommentScheduler, SchedulerConfig, ScheduledComment } from '../../src/scheduler/comment-scheduler';
import { RateLimiter } from '../../src/scheduler/rate-limiter';

describe('CommentScheduler', () => {
  let scheduler: CommentScheduler;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let config: SchedulerConfig;

  beforeEach(() => {
    mockRateLimiter = {
      checkLimit: jest.fn(),
      clearHistory: jest.fn(),
      getStatistics: jest.fn(),
      updateConfig: jest.fn(),
      getConfig: jest.fn(),
      destroy: jest.fn(),
    } as any;

    config = {
      rateLimiter: mockRateLimiter,
      maxQueueSize: 10,
      processingIntervalMs: 1000,
      retryAttempts: 3,
      retryDelayMs: 2000,
    };

    scheduler = new CommentScheduler(config);
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('queue management', () => {
    test('コメントをキューに追加できること', async () => {
      const comment: ScheduledComment = {
        id: 'comment-1',
        text: 'テストコメント',
        priority: 1,
        timestamp: Date.now(),
      };

      const result = scheduler.enqueue(comment);
      expect(result.success).toBe(true);
      expect(result.position).toBe(1);
      expect(result.queueSize).toBe(1);
    });

    test('優先度順にキューが並べられること', async () => {
      const lowPriority: ScheduledComment = {
        id: 'low',
        text: '低優先度',
        priority: 1,
        timestamp: Date.now(),
      };

      const highPriority: ScheduledComment = {
        id: 'high',
        text: '高優先度',
        priority: 5,
        timestamp: Date.now(),
      };

      scheduler.enqueue(lowPriority);
      scheduler.enqueue(highPriority);

      const queue = scheduler.getQueue();
      expect(queue[0]?.id).toBe('high');
      expect(queue[1]?.id).toBe('low');
    });

    test('キューサイズ制限が機能すること', async () => {
      // 10個まで追加
      for (let i = 0; i < 10; i++) {
        const result = scheduler.enqueue({
          id: `comment-${i}`,
          text: `コメント${i}`,
          priority: 1,
          timestamp: Date.now(),
        });
        expect(result.success).toBe(true);
      }

      // 11個目は拒否される
      const result = scheduler.enqueue({
        id: 'comment-11',
        text: 'コメント11',
        priority: 1,
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('queue_full');
    });

    test('特定のコメントを削除できること', async () => {
      scheduler.enqueue({
        id: 'comment-1',
        text: 'コメント1',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.enqueue({
        id: 'comment-2',
        text: 'コメント2',
        priority: 1,
        timestamp: Date.now(),
      });

      const removed = scheduler.removeFromQueue('comment-1');
      expect(removed).toBe(true);

      const queue = scheduler.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0]?.id).toBe('comment-2');
    });

    test('キューをクリアできること', async () => {
      for (let i = 0; i < 5; i++) {
        scheduler.enqueue({
          id: `comment-${i}`,
          text: `コメント${i}`,
          priority: 1,
          timestamp: Date.now(),
        });
      }

      scheduler.clearQueue();
      const queue = scheduler.getQueue();
      expect(queue.length).toBe(0);
    });
  });

  describe('processing', () => {
    test('スケジューラーを開始・停止できること', async () => {
      expect(scheduler.isRunning()).toBe(false);

      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    test('コメントが順次処理されること', async () => {
      jest.useFakeTimers();

      // レート制限をパスする設定
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
      });

      const onProcess = jest.fn();
      scheduler.on('processed', onProcess);

      // コメントを追加
      scheduler.enqueue({
        id: 'comment-1',
        text: 'コメント1',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.enqueue({
        id: 'comment-2',
        text: 'コメント2',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.start();

      // 処理を進める
      await jest.advanceTimersByTimeAsync(1000);
      expect(onProcess).toHaveBeenCalledTimes(1);
      expect(onProcess).toHaveBeenCalledWith(expect.objectContaining({
        comment: expect.objectContaining({ id: 'comment-1' }),
        success: true,
      }));

      await jest.advanceTimersByTimeAsync(1000);
      expect(onProcess).toHaveBeenCalledTimes(2);
      expect(onProcess).toHaveBeenCalledWith(expect.objectContaining({
        comment: expect.objectContaining({ id: 'comment-2' }),
        success: true,
      }));

      scheduler.stop();
      jest.useRealTimers();
    });

    test('レート制限で拒否されたコメントがリトライされること', async () => {
      jest.useFakeTimers();

      // 最初は拒否、2回目で許可
      mockRateLimiter.checkLimit
        .mockResolvedValueOnce({
          allowed: false,
          reason: 'min_interval',
          retryAfter: 5,
        })
        .mockResolvedValueOnce({
          allowed: true,
        });

      const onProcess = jest.fn();
      scheduler.on('processed', onProcess);

      scheduler.enqueue({
        id: 'comment-1',
        text: 'コメント1',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.start();

      // 最初の試行（拒否される）
      await jest.advanceTimersByTimeAsync(1000);
      expect(onProcess).not.toHaveBeenCalled();

      // リトライ（2秒後）
      await jest.advanceTimersByTimeAsync(2000);
      
      // 処理時間を待つ
      await jest.advanceTimersByTimeAsync(1000);
      
      expect(onProcess).toHaveBeenCalledWith(expect.objectContaining({
        comment: expect.objectContaining({ id: 'comment-1' }),
        success: true,
        attempts: 2,
      }));

      scheduler.stop();
      jest.useRealTimers();
    });

    test('最大リトライ回数を超えたら諦めること', async () => {
      jest.useFakeTimers();

      // 常に拒否
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: false,
        reason: 'rate_limit',
        retryAfter: 10,
      });

      const onFailed = jest.fn();
      scheduler.on('failed', onFailed);

      scheduler.enqueue({
        id: 'comment-1',
        text: 'コメント1',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.start();

      // 最初の試行 + 3回リトライ
      await jest.advanceTimersByTimeAsync(1000); // 最初の試行
      await jest.advanceTimersByTimeAsync(2000); // リトライ1
      await jest.advanceTimersByTimeAsync(1000); // 処理
      await jest.advanceTimersByTimeAsync(2000); // リトライ2
      await jest.advanceTimersByTimeAsync(1000); // 処理
      await jest.advanceTimersByTimeAsync(2000); // リトライ3
      await jest.advanceTimersByTimeAsync(1000); // 処理

      expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({
        comment: expect.objectContaining({ id: 'comment-1' }),
        reason: 'max_retries',
        attempts: 4,
      }));

      scheduler.stop();
      jest.useRealTimers();
    });

    test('重複コメントは即座に破棄されること', async () => {
      jest.useFakeTimers();
      
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: false,
        reason: 'duplicate',
      });

      const onFailed = jest.fn();
      scheduler.on('failed', onFailed);

      scheduler.enqueue({
        id: 'comment-1',
        text: '重複コメント',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.start();

      // 処理を進める
      await jest.advanceTimersByTimeAsync(1100);

      expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({
        comment: expect.objectContaining({ id: 'comment-1' }),
        reason: 'duplicate',
        attempts: 1,
      }));

      scheduler.stop();
      jest.useRealTimers();
    });
  });

  describe('status and statistics', () => {
    test('ステータスを取得できること', async () => {
      scheduler.enqueue({
        id: 'comment-1',
        text: 'コメント1',
        priority: 1,
        timestamp: Date.now(),
      });

      const status = scheduler.getStatus();
      
      expect(status.running).toBe(false);
      expect(status.queueSize).toBe(1);
      expect(status.processing).toBe(false);
      expect(status.totalProcessed).toBe(0);
      expect(status.totalFailed).toBe(0);
    });

    test('処理統計が更新されること', async () => {
      jest.useFakeTimers();

      mockRateLimiter.checkLimit
        .mockResolvedValueOnce({ allowed: true })
        .mockResolvedValueOnce({ allowed: false, reason: 'duplicate' });

      scheduler.enqueue({
        id: 'comment-1',
        text: 'コメント1',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.enqueue({
        id: 'comment-2',
        text: '重複',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.start();
      await jest.advanceTimersByTimeAsync(3000);

      const status = scheduler.getStatus();
      expect(status.totalProcessed).toBe(1);
      expect(status.totalFailed).toBe(1);

      scheduler.stop();
      jest.useRealTimers();
    });
  });

  describe('event handling', () => {
    test('イベントリスナーを追加・削除できること', () => {
      const listener = jest.fn();
      
      scheduler.on('processed', listener);
      scheduler.emit('processed', { comment: {} as any, success: true });
      
      expect(listener).toHaveBeenCalledTimes(1);

      scheduler.off('processed', listener);
      scheduler.emit('processed', { comment: {} as any, success: true });
      
      expect(listener).toHaveBeenCalledTimes(1);
    });

    test('エラーイベントが発火すること', async () => {
      const onError = jest.fn();
      scheduler.on('error', onError);

      // checkLimitでエラーを投げる
      mockRateLimiter.checkLimit.mockRejectedValue(new Error('Test error'));

      scheduler.enqueue({
        id: 'comment-1',
        text: 'コメント1',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.start();
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(Error),
        comment: expect.objectContaining({ id: 'comment-1' }),
      }));

      scheduler.stop();
    });
  });

  describe('pause and resume', () => {
    test('一時停止と再開ができること', async () => {
      jest.useFakeTimers();

      mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true });

      const onProcess = jest.fn();
      scheduler.on('processed', onProcess);

      scheduler.enqueue({
        id: 'comment-1',
        text: 'コメント1',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.enqueue({
        id: 'comment-2',
        text: 'コメント2',
        priority: 1,
        timestamp: Date.now(),
      });

      scheduler.start();

      // 1つ目を処理
      await jest.advanceTimersByTimeAsync(1000);
      expect(onProcess).toHaveBeenCalledTimes(1);

      // 一時停止
      scheduler.pause();
      expect(scheduler.isPaused()).toBe(true);

      // 時間を進めても処理されない
      await jest.advanceTimersByTimeAsync(2000);
      expect(onProcess).toHaveBeenCalledTimes(1);

      // 再開
      scheduler.resume();
      expect(scheduler.isPaused()).toBe(false);

      // 2つ目が処理される
      await jest.advanceTimersByTimeAsync(1000);
      expect(onProcess).toHaveBeenCalledTimes(2);

      scheduler.stop();
      jest.useRealTimers();
    });
  });
});
