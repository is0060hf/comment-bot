/**
 * Tsumiki AITDD - Refactor Phase
 * タスク9: ロギング/エラー処理の統合テスト
 */

import { Logger, LogLevel } from '../../src/logging';
import { ErrorHandler, AppError, ErrorCategory, RetryableError } from '../../src/errors';
import * as fs from 'fs';
import * as path from 'path';

describe('Logging and Error Handling Integration', () => {
  const testLogDir = path.join(process.cwd(), 'tests', 'integration', 'test-logs');
  let logger: Logger;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    // テスト用ディレクトリを作成
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });

    logger = new Logger({
      level: LogLevel.INFO,
      logDir: testLogDir,
      console: false,
    });

    errorHandler = new ErrorHandler({
      logger,
      enableStackTrace: true,
      maxRetries: 3,
      retryDelayMs: 50,
    });
  });

  afterEach(() => {
    logger.close();
    // テスト用ディレクトリを削除
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
  });

  test('エラーがログファイルに記録されること', async () => {
    const error = new Error('Test error');
    const context = { userId: 'test123', operation: 'testOp' };

    errorHandler.handle(error, context);

    // ファイル書き込みを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    const logFiles = fs.readdirSync(testLogDir);
    expect(logFiles.length).toBeGreaterThan(0);

    const logContent = fs.readFileSync(
      path.join(testLogDir, logFiles[0]!),
      'utf-8'
    );

    expect(logContent).toContain('Test error');
    expect(logContent).toContain('test123');
    expect(logContent).toContain('testOp');
  });

  test('リトライ可能なエラーのログが適切に記録されること', async () => {
    let attemptCount = 0;
    const operation = jest.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new RetryableError(
          'Temporary failure',
          ErrorCategory.NETWORK,
          3,
          50
        );
      }
      return 'success';
    });

    const result = await errorHandler.withRetry(operation);
    expect(result).toBe('success');

    // ログを確認
    await new Promise(resolve => setTimeout(resolve, 100));

    const logFiles = fs.readdirSync(testLogDir);
    const logContent = fs.readFileSync(
      path.join(testLogDir, logFiles[0]!),
      'utf-8'
    );

    // リトライエラーが2回記録されている
    const errorLogs = logContent.match(/Temporary failure/g);
    expect(errorLogs?.length).toBe(2);
  });

  test('PIIがマスクされてログに記録されること', async () => {
    const error = new Error('User email test@example.com failed authentication');
    const context = {
      phone: '090-1234-5678',
      ip: '192.168.1.1',
    };

    errorHandler.handle(error, context);

    await new Promise(resolve => setTimeout(resolve, 100));

    const logFiles = fs.readdirSync(testLogDir);
    const logContent = fs.readFileSync(
      path.join(testLogDir, logFiles[0]!),
      'utf-8'
    );

    // PIIがマスクされている
    expect(logContent).toContain('[EMAIL]');
    expect(logContent).not.toContain('test@example.com');
    expect(logContent).toContain('[PHONE]');
    expect(logContent).not.toContain('090-1234-5678');
    expect(logContent).toContain('[IP]');
    expect(logContent).not.toContain('192.168.1.1');
  });

  test('エラー統計が正しくログに記録されること', async () => {
    // 異なるカテゴリのエラーを発生
    errorHandler.handle(new Error('Network timeout'));
    errorHandler.handle(new Error('Invalid token'));
    errorHandler.handle(new Error('Rate limit exceeded'));
    errorHandler.handle(new Error('Network error'));

    const stats = errorHandler.getStatistics();
    
    // 統計をログに記録
    logger.info('Error statistics', stats);

    await new Promise(resolve => setTimeout(resolve, 100));

    const logFiles = fs.readdirSync(testLogDir);
    const logContent = fs.readFileSync(
      path.join(testLogDir, logFiles[0]!),
      'utf-8'
    );

    expect(logContent).toContain('Error statistics');
    expect(logContent).toContain('NETWORK');
    expect(logContent).toContain('AUTHENTICATION');
    expect(logContent).toContain('RATE_LIMIT');
  });

  test('ログレベルによるフィルタリングとエラー処理が連携すること', () => {
    // DEBUGレベルに変更
    logger.setLevel(LogLevel.DEBUG);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    logger.setConsoleOutput(true);

    // デバッグログ
    logger.debug('Debug info');

    // エラー処理
    const error = new AppError('Critical error', ErrorCategory.UNKNOWN);
    errorHandler.handle(error);

    // デバッグレベルなのでDEBUGログは出力されない（コンソールはINFO以上のみ）
    expect(consoleSpy).not.toHaveBeenCalled();
    // エラーは出力される
    expect(errorSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('非同期エラーが適切にログに記録されること', async () => {
    // 新しいロガーインスタンスを作成（他のテストの影響を避ける）
    const asyncLogger = new Logger({
      level: LogLevel.INFO,
      logDir: testLogDir,
      console: false,
    });

    const asyncErrorHandler = new ErrorHandler({
      logger: asyncLogger,
      enableStackTrace: true,
    });

    const asyncOperation = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      throw new Error('Async operation failed');
    };

    try {
      await asyncOperation();
    } catch (error) {
      asyncErrorHandler.handle(error as Error, { async: true });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const logFiles = fs.readdirSync(testLogDir);
    const logContent = fs.readFileSync(
      path.join(testLogDir, logFiles[logFiles.length - 1]!),
      'utf-8'
    );

    expect(logContent).toContain('Async operation failed');
    expect(logContent).toContain('async');
    
    asyncLogger.close();
  });
});
