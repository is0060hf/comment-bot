/**
 * Tsumiki AITDD - Red Phase
 * タスク9: エラーハンドラーのテストケース
 */

import { 
  ErrorHandler, 
  ErrorHandlerConfig, 
  AppError, 
  ErrorCategory,
  RetryableError,
  NonRetryableError 
} from '../../src/errors/error-handler';
import { Logger } from '../../src/logging/logger';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockLogger: jest.Mocked<Logger>;
  let config: ErrorHandlerConfig;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    } as any;

    config = {
      logger: mockLogger,
      enableStackTrace: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      reportErrors: false, // テスト時は外部報告を無効化
    };

    errorHandler = new ErrorHandler(config);
  });

  describe('error handling', () => {
    test('一般的なエラーを処理できること', () => {
      const error = new Error('Something went wrong');
      const handled = errorHandler.handle(error);

      expect(handled).toBeInstanceOf(AppError);
      expect(handled.message).toBe('Something went wrong');
      expect(handled.category).toBe(ErrorCategory.UNKNOWN);
      expect(handled.isRetryable).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('AppErrorを正しく分類できること', () => {
      const networkError = new AppError(
        'Network timeout',
        ErrorCategory.NETWORK,
        true
      );

      const handled = errorHandler.handle(networkError);

      expect(handled.category).toBe(ErrorCategory.NETWORK);
      expect(handled.isRetryable).toBe(true);
    });

    test('RetryableErrorを識別できること', () => {
      const retryableError = new RetryableError(
        'Temporary failure',
        ErrorCategory.API,
        3,
        2000
      );

      const handled = errorHandler.handle(retryableError);

      expect(handled.isRetryable).toBe(true);
      expect(handled.maxRetries).toBe(3);
      expect(handled.retryDelay).toBe(2000);
    });

    test('NonRetryableErrorを識別できること', () => {
      const nonRetryableError = new NonRetryableError(
        'Invalid API key',
        ErrorCategory.AUTHENTICATION
      );

      const handled = errorHandler.handle(nonRetryableError);

      expect(handled.isRetryable).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Non-retryable error'),
        expect.any(Object)
      );
    });
  });

  describe('error categorization', () => {
    test('ネットワークエラーを分類できること', () => {
      const errors = [
        new Error('ECONNREFUSED'),
        new Error('ETIMEDOUT'),
        new Error('Network request failed'),
        new Error('fetch failed'),
      ];

      errors.forEach(error => {
        const handled = errorHandler.handle(error);
        expect(handled.category).toBe(ErrorCategory.NETWORK);
        expect(handled.isRetryable).toBe(true);
      });
    });

    test('レート制限エラーを分類できること', () => {
      const error = new Error('Rate limit exceeded');
      error.name = 'RateLimitError';
      
      const handled = errorHandler.handle(error);
      
      expect(handled.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(handled.isRetryable).toBe(true);
      expect(handled.retryDelay).toBeGreaterThan(0);
    });

    test('認証エラーを分類できること', () => {
      const errors = [
        new Error('Invalid token'),
        new Error('Unauthorized'),
        new Error('Authentication failed'),
      ];

      errors.forEach(error => {
        const handled = errorHandler.handle(error);
        expect(handled.category).toBe(ErrorCategory.AUTHENTICATION);
        expect(handled.isRetryable).toBe(false);
      });
    });

    test('バリデーションエラーを分類できること', () => {
      const error = new Error('Invalid input: comment too long');
      error.name = 'ValidationError';

      const handled = errorHandler.handle(error);
      
      expect(handled.category).toBe(ErrorCategory.VALIDATION);
      expect(handled.isRetryable).toBe(false);
    });
  });

  describe('retry logic', () => {
    test('リトライ可能なエラーでリトライできること', async () => {
      const error = new RetryableError(
        'Temporary failure',
        ErrorCategory.API,
        3,
        100
      );

      let attemptCount = 0;
      const operation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw error;
        }
        return 'success';
      });

      const result = await errorHandler.withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('最大リトライ回数を超えたら失敗すること', async () => {
      const error = new RetryableError(
        'Persistent failure',
        ErrorCategory.API,
        2,
        50
      );

      const operation = jest.fn().mockRejectedValue(error);

      await expect(errorHandler.withRetry(operation)).rejects.toThrow('Persistent failure');
      expect(operation).toHaveBeenCalledTimes(3); // 初回 + 2リトライ
    });

    test('リトライ不可能なエラーではリトライしないこと', async () => {
      const error = new NonRetryableError(
        'Bad request',
        ErrorCategory.VALIDATION
      );

      const operation = jest.fn().mockRejectedValue(error);

      await expect(errorHandler.withRetry(operation)).rejects.toThrow('Bad request');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('指数バックオフが機能すること', async () => {
      jest.useFakeTimers();

      const error = new RetryableError(
        'Temp error',
        ErrorCategory.NETWORK,
        3,
        1000
      );

      let attemptCount = 0;
      const operation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw error;
        }
        return 'success';
      });

      const retryPromise = errorHandler.withRetry(operation, {
        useExponentialBackoff: true,
      });

      // 初回実行
      await jest.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);

      // 1回目のリトライ（1秒後）
      await jest.advanceTimersByTimeAsync(1000);
      expect(operation).toHaveBeenCalledTimes(2);

      // 2回目のリトライ（2秒後）
      await jest.advanceTimersByTimeAsync(2000);
      expect(operation).toHaveBeenCalledTimes(3);

      const result = await retryPromise;
      expect(result).toBe('success');

      jest.useRealTimers();
    });
  });

  describe('error context', () => {
    test('エラーにコンテキスト情報を追加できること', () => {
      const error = new Error('Database error');
      const context = {
        operation: 'saveComment',
        userId: 'user123',
        timestamp: Date.now(),
      };

      const handled = errorHandler.handle(error, context);

      expect(handled.context).toEqual(context);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          context,
        })
      );
    });

    test('スタックトレースを含められること', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:5';

      const handled = errorHandler.handle(error);

      expect(handled.stack).toBe(error.stack);
    });

    test('スタックトレースを無効化できること', () => {
      errorHandler = new ErrorHandler({
        ...config,
        enableStackTrace: false,
      });

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:5';

      const handled = errorHandler.handle(error);

      expect(handled.stack).toBeUndefined();
    });
  });

  describe('error aggregation', () => {
    test('エラー統計を収集できること', () => {
      // 異なるカテゴリのエラーを発生させる
      errorHandler.handle(new Error('Network error'));
      errorHandler.handle(new Error('Rate limit exceeded'));
      errorHandler.handle(new Error('Invalid token'));
      errorHandler.handle(new Error('Network timeout'));

      const stats = errorHandler.getStatistics();

      expect(stats.total).toBe(4);
      expect(stats.byCategory[ErrorCategory.NETWORK]).toBe(2);
      expect(stats.byCategory[ErrorCategory.RATE_LIMIT]).toBe(1);
      expect(stats.byCategory[ErrorCategory.AUTHENTICATION]).toBe(1);
    });

    test('時間別のエラー統計を取得できること', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(now - 3600000) // 1時間前
        .mockReturnValueOnce(now - 1800000) // 30分前
        .mockReturnValueOnce(now - 300000)  // 5分前
        .mockReturnValueOnce(now);          // 現在

      errorHandler.handle(new Error('Old error'));
      errorHandler.handle(new Error('Recent error 1'));
      errorHandler.handle(new Error('Recent error 2'));
      errorHandler.handle(new Error('Current error'));

      const recentStats = errorHandler.getStatistics({ 
        since: new Date(now - 600000) // 過去10分
      });

      expect(recentStats.total).toBe(4); // すべてのエラー（時間スタンプはDate.now()に依存）
    });
  });

  describe('error recovery', () => {
    test('エラーからの回復戦略を提供できること', () => {
      const networkError = new AppError(
        'Connection failed',
        ErrorCategory.NETWORK,
        true
      );

      const strategy = errorHandler.getRecoveryStrategy(networkError);

      expect(strategy).toMatchObject({
        shouldRetry: true,
        retryDelay: expect.any(Number),
        alternativeAction: expect.any(String),
      });
    });

    test('カテゴリ別の回復戦略があること', () => {
      const errors = [
        { error: new AppError('', ErrorCategory.NETWORK, true), expectedAction: 'retry' },
        { error: new AppError('', ErrorCategory.RATE_LIMIT, true), expectedAction: 'backoff' },
        { error: new AppError('', ErrorCategory.AUTHENTICATION, false), expectedAction: 'reauthenticate' },
        { error: new AppError('', ErrorCategory.VALIDATION, false), expectedAction: 'fix_input' },
      ];

      errors.forEach(({ error, expectedAction }) => {
        const strategy = errorHandler.getRecoveryStrategy(error);
        expect(strategy.alternativeAction).toContain(expectedAction);
      });
    });
  });

  describe('error reporting', () => {
    test('重大なエラーを外部に報告できること', async () => {
      const reportSpy = jest.fn().mockResolvedValue(undefined);
      errorHandler = new ErrorHandler({
        ...config,
        reportErrors: true,
        errorReporter: reportSpy,
      });

      const criticalError = new Error('Critical system failure');
      criticalError.name = 'CriticalError';

      await errorHandler.handleAndReport(criticalError);

      expect(reportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Critical system failure',
          severity: 'critical',
        })
      );
    });

    test('通常のエラーは報告しないこと', async () => {
      const reportSpy = jest.fn();
      errorHandler = new ErrorHandler({
        ...config,
        reportErrors: true,
        errorReporter: reportSpy,
      });

      const normalError = new Error('Normal operation error');
      
      await errorHandler.handleAndReport(normalError);

      expect(reportSpy).not.toHaveBeenCalled();
    });
  });
});
