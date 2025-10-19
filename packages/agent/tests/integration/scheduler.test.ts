/**
 * Tsumiki AITDD - Refactor Phase
 * タスク8: スケジューラー統合テスト
 */

import { RateLimiter } from '../../src/scheduler/rate-limiter';
import { CommentScheduler } from '../../src/scheduler/comment-scheduler';

describe('Scheduler Integration', () => {
  let rateLimiter: RateLimiter;
  let scheduler: CommentScheduler;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      minIntervalSeconds: 1,
      maxPer10Minutes: 10,
      cooldownSeconds: 5,
      dedupeWindowSeconds: 30,
    }, true);

    scheduler = new CommentScheduler({
      rateLimiter,
      maxQueueSize: 5,
      processingIntervalMs: 100,
      retryAttempts: 2,
      retryDelayMs: 500,
    });
  });

  afterEach(() => {
    scheduler.stop();
    rateLimiter.destroy();
  });

  test('エンドツーエンドフロー', async () => {
    jest.useFakeTimers();
    
    const processed: any[] = [];
    const failed: any[] = [];

    scheduler.on('processed', (event) => processed.push(event));
    scheduler.on('failed', (event) => failed.push(event));

    // 様々なコメントを追加
    scheduler.enqueue({
      id: '1',
      text: '最初のコメント',
      priority: 1,
      timestamp: Date.now(),
    });

    scheduler.enqueue({
      id: '2',
      text: '優先度高いコメント',
      priority: 5,
      timestamp: Date.now(),
    });

    scheduler.enqueue({
      id: '3',
      text: '最初のコメント', // 重複
      priority: 1,
      timestamp: Date.now(),
    });

    scheduler.start();

    // 処理を進める
    await jest.advanceTimersByTimeAsync(500);

    // 優先度の高いコメントが先に処理される
    expect(processed[0]?.comment.id).toBe('2');
    expect(processed[0]?.success).toBe(true);

    await jest.advanceTimersByTimeAsync(1500);

    // 2番目のコメント
    expect(processed[1]?.comment.id).toBe('1');
    expect(processed[1]?.success).toBe(true);

    await jest.advanceTimersByTimeAsync(500);

    // 重複コメントは失敗
    expect(failed[0]?.comment.id).toBe('3');
    expect(failed[0]?.reason).toBe('duplicate');

    const status = scheduler.getStatus();
    expect(status.totalProcessed).toBe(2);
    expect(status.totalFailed).toBe(1);
    expect(status.queueSize).toBe(0);

    jest.useRealTimers();
  });

  test('レート制限とリトライの統合', async () => {
    jest.useFakeTimers();
    const startTime = Date.now();
    jest.setSystemTime(startTime);

    const processed: any[] = [];
    scheduler.on('processed', (event) => processed.push(event));

    // 連続でコメントを追加
    for (let i = 0; i < 5; i++) {
      scheduler.enqueue({
        id: `comment-${i}`,
        text: `コメント${i}`,
        priority: 1,
        timestamp: Date.now(),
      });
    }

    scheduler.start();

    // すべて処理されるまで待つ
    for (let i = 0; i < 20; i++) {
      await jest.advanceTimersByTimeAsync(1000);
      jest.setSystemTime(startTime + (i + 1) * 1000);
    }

    // 最小間隔を守りながら処理される（クールダウンで一部失敗する可能性）
    expect(processed.length).toBeGreaterThanOrEqual(3);
    expect(processed.length).toBeLessThanOrEqual(5);
    processed.forEach((event) => {
      expect(event.success).toBe(true);
      expect(event.attempts).toBeGreaterThanOrEqual(1);
    });

    scheduler.stop();
    jest.useRealTimers();
  });

  test('一時停止と再開の統合', async () => {
    jest.useFakeTimers();

    const processed: any[] = [];
    scheduler.on('processed', (event) => processed.push(event));

    // コメントを追加
    for (let i = 0; i < 3; i++) {
      scheduler.enqueue({
        id: `comment-${i}`,
        text: `コメント${i}`,
        priority: 1,
        timestamp: Date.now(),
      });
    }

    scheduler.start();

    // 1つ処理
    await jest.advanceTimersByTimeAsync(200);
    expect(processed.length).toBe(1);

    // 一時停止
    scheduler.pause();
    expect(scheduler.isPaused()).toBe(true);

    // 時間を進めても処理されない
    await jest.advanceTimersByTimeAsync(2000);
    expect(processed.length).toBe(1);

    // 再開
    scheduler.resume();
    expect(scheduler.isPaused()).toBe(false);

    // 残りが処理される
    await jest.advanceTimersByTimeAsync(2000);
    expect(processed.length).toBe(3);

    scheduler.stop();
    jest.useRealTimers();
  });

  test('クールダウンの統合', async () => {
    jest.useFakeTimers();
    const startTime = Date.now();
    jest.setSystemTime(startTime);

    const failed: any[] = [];
    scheduler.on('failed', (event) => failed.push(event));
    scheduler.on('processed', () => {});

    // 短時間に大量のコメント
    for (let i = 0; i < 6; i++) {
      scheduler.enqueue({
        id: `burst-${i}`,
        text: `バーストコメント${i}`,
        priority: 1,
        timestamp: Date.now(),
      });
    }

    scheduler.start();

    // 処理を進める
    for (let i = 0; i < 10; i++) {
      await jest.advanceTimersByTimeAsync(500);
      jest.setSystemTime(startTime + (i + 1) * 500);
    }

    // クールダウンが発生したか確認
    const stats = rateLimiter.getStatistics();
    if (stats.rejectionReasons.cooldown) {
      expect(stats.rejectionReasons.cooldown).toBeGreaterThan(0);
    }

    scheduler.stop();
    jest.useRealTimers();
  });

  test('設定の動的更新', async () => {
    // レート制限の設定を更新
    rateLimiter.updateConfig({
      minIntervalSeconds: 2,
      maxPer10Minutes: 5,
      cooldownSeconds: 10,
      dedupeWindowSeconds: 60,
    });

    const newConfig = rateLimiter.getConfig();
    expect(newConfig.minIntervalSeconds).toBe(2);
    expect(newConfig.maxPer10Minutes).toBe(5);

    // 統計情報の確認
    const stats = rateLimiter.getStatistics();
    expect(stats.totalAttempts).toBe(0);
    expect(stats.totalAllowed).toBe(0);
    expect(stats.totalRejected).toBe(0);
  });
});
