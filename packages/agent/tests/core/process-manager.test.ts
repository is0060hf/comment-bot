/**
 * Tsumiki AITDD - Red Phase
 * タスク43: プロセス管理のテストケース
 */

import { ProcessManager, ProcessManagerOptions } from '../../src/core/process-manager';
import { EventEmitter } from 'events';
import * as http from 'http';

describe('ProcessManager', () => {
  let processManager: ProcessManager;
  let mockLogger: any;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // process.exitをモック
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    });

    const options: ProcessManagerOptions = {
      logger: mockLogger,
      gracefulShutdownTimeout: 5000,
      exitOnError: false, // テスト環境では自動終了を無効化
    };

    processManager = new ProcessManager(options);
  });

  afterEach(() => {
    processManager.stop();
    processManager.removeAllListeners();
    mockExit.mockRestore();
    // プロセスリスナーをクリーンアップ
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  describe('Signal handling', () => {
    test('SIGINTシグナルを処理できること', async () => {
      const shutdownSpy = jest.fn();
      processManager.on('shutdown', shutdownSpy);

      // プロセスを開始
      processManager.start();

      // SIGINTを発火
      process.emit('SIGINT');

      expect(shutdownSpy).toHaveBeenCalledWith({
        signal: 'SIGINT',
        code: 130, // 128 + 2 (SIGINT)
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('SIGINT')
      );
    });

    test('SIGTERMシグナルを処理できること', async () => {
      const shutdownSpy = jest.fn();
      processManager.on('shutdown', shutdownSpy);

      processManager.start();

      // SIGTERMを発火
      process.emit('SIGTERM');

      expect(shutdownSpy).toHaveBeenCalledWith({
        signal: 'SIGTERM',
        code: 143, // 128 + 15 (SIGTERM)
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('SIGTERM')
      );
    });

    test('複数のシグナルハンドラーを登録できること', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      processManager.on('shutdown', handler1);
      processManager.on('shutdown', handler2);

      processManager.start();
      process.emit('SIGINT');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    test('シグナルハンドラーを削除できること', () => {
      const handler = jest.fn();
      processManager.on('shutdown', handler);

      processManager.start();
      processManager.stop();

      process.emit('SIGINT');

      // stop後はハンドラーが呼ばれない
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Graceful shutdown', () => {
    test('グレースフルシャットダウンが実行されること', async () => {
      const cleanupTasks: Array<() => Promise<void>> = [];
      
      // クリーンアップタスクを登録
      const task1 = jest.fn().mockResolvedValue(undefined);
      const task2 = jest.fn().mockResolvedValue(undefined);
      
      processManager.registerCleanupTask('task1', task1);
      processManager.registerCleanupTask('task2', task2);

      processManager.start();

      // シャットダウンを実行
      await processManager.shutdown();

      expect(task1).toHaveBeenCalled();
      expect(task2).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup completed')
      );
    });

    test('クリーンアップタスクのタイムアウトが機能すること', async () => {
      jest.useFakeTimers();

      // 長時間かかるタスク
      const slowTask = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 10000))
      );

      processManager.registerCleanupTask('slowTask', slowTask);
      processManager.start();

      const shutdownPromise = processManager.shutdown();

      // タイムアウト時間まで進める
      await jest.advanceTimersByTimeAsync(5000);

      await expect(shutdownPromise).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('timeout'),
        expect.any(Error)
      );

      jest.useRealTimers();
    });

    test('クリーンアップタスクのエラーをハンドリングすること', async () => {
      const errorTask = jest.fn().mockRejectedValue(new Error('Cleanup failed'));
      
      processManager.registerCleanupTask('errorTask', errorTask);
      processManager.start();

      await processManager.shutdown();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup task failed'),
        expect.objectContaining({
          task: 'errorTask',
          error: expect.any(Error),
        })
      );
    });

    test('複数回のシャットダウン要求を防ぐこと', async () => {
      const task = jest.fn().mockResolvedValue(undefined);
      processManager.registerCleanupTask('task', task);

      processManager.start();

      // 同時に複数回シャットダウンを要求
      const promise1 = processManager.shutdown();
      const promise2 = processManager.shutdown();

      await Promise.all([promise1, promise2]);

      // タスクは1回だけ実行される
      expect(task).toHaveBeenCalledTimes(1);
    });
  });

  describe('HTTP server management', () => {
    test('HTTPサーバーを管理できること', async () => {
      const mockServer = new EventEmitter() as http.Server;
      mockServer.close = jest.fn((callback?: any) => {
        callback?.();
        return mockServer;
      }) as any;

      processManager.registerHttpServer('oauth', mockServer);
      processManager.start();

      await processManager.shutdown();

      expect(mockServer.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('HTTP server closed: oauth')
      );
    });

    test('複数のHTTPサーバーを管理できること', async () => {
      const server1 = new EventEmitter() as http.Server;
      server1.close = jest.fn((cb?: any) => {
        cb?.();
        return server1;
      }) as any;

      const server2 = new EventEmitter() as http.Server;
      server2.close = jest.fn((cb?: any) => {
        cb?.();
        return server2;
      }) as any;

      processManager.registerHttpServer('server1', server1);
      processManager.registerHttpServer('server2', server2);

      await processManager.shutdown();

      expect(server1.close).toHaveBeenCalled();
      expect(server2.close).toHaveBeenCalled();
    });

    test('サーバー停止のエラーをハンドリングすること', async () => {
      const mockServer = new EventEmitter() as http.Server;
      mockServer.close = jest.fn((callback?: any) => {
        callback?.(new Error('Server close failed'));
        return mockServer;
      }) as any;

      processManager.registerHttpServer('errorServer', mockServer);

      await processManager.shutdown();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to close HTTP server'),
        expect.objectContaining({
          server: 'errorServer',
          error: expect.any(Error),
        })
      );
    });
  });

  describe('Process lifecycle', () => {
    test('プロセスの状態を管理できること', () => {
      expect(processManager.isRunning()).toBe(false);

      processManager.start();
      expect(processManager.isRunning()).toBe(true);

      processManager.stop();
      expect(processManager.isRunning()).toBe(false);
    });

    test('開始時と停止時にイベントが発火されること', () => {
      const startSpy = jest.fn();
      const stopSpy = jest.fn();

      processManager.on('started', startSpy);
      processManager.on('stopped', stopSpy);

      processManager.start();
      expect(startSpy).toHaveBeenCalled();

      processManager.stop();
      expect(stopSpy).toHaveBeenCalled();
    });

    test('未処理の例外をキャッチできること', () => {
      const errorSpy = jest.fn();
      processManager.on('error', errorSpy);

      processManager.start();

      const error = new Error('Unhandled error');
      process.emit('uncaughtException', error);

      expect(errorSpy).toHaveBeenCalledWith(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Uncaught exception'),
        error
      );
    });

    test('未処理のPromiseリジェクションをキャッチできること', async () => {
      const errorSpy = jest.fn();
      processManager.on('error', errorSpy);

      processManager.start();

      const reason = new Error('Unhandled rejection');
      // プロミスを即座にキャッチして警告を防ぐ
      const promise = Promise.reject(reason).catch(() => {});
      
      // unhandledRejectionイベントをエミュレート
      process.emit('unhandledRejection', reason, promise);

      // イベントループを待つ
      await new Promise(resolve => setImmediate(resolve));

      expect(errorSpy).toHaveBeenCalledWith(reason);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled rejection'),
        reason
      );
    });
  });

  describe('Exit code management', () => {
    test('正常終了時は0を返すこと', async () => {
      processManager.start();

      await processManager.shutdown();

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('エラー終了時は適切な終了コードを返すこと', async () => {
      const errorTask = jest.fn().mockRejectedValue(new Error('Fatal error'));
      processManager.registerCleanupTask('fatalTask', errorTask);

      processManager.start();

      await processManager.shutdown({ exitCode: 1 });

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Resource cleanup', () => {
    test('タイマーをクリアできること', () => {
      const timerId = setTimeout(() => {}, 10000);
      const intervalId = setInterval(() => {}, 1000);

      processManager.registerTimer('timeout', timerId);
      processManager.registerInterval('interval', intervalId);

      processManager.start();

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      processManager.clearTimers();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId);
      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);

      clearTimeoutSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    test('ファイルハンドルをクローズできること', async () => {
      const mockFileHandle = {
        close: jest.fn().mockResolvedValue(undefined),
      };

      processManager.registerFileHandle('logFile', mockFileHandle as any);

      await processManager.shutdown();

      expect(mockFileHandle.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('File handle closed: logFile')
      );
    });

    test('WebSocketコネクションをクローズできること', async () => {
      const mockWebSocket = {
        close: jest.fn(),
        readyState: 1, // OPEN
      };

      processManager.registerWebSocket('wsConnection', mockWebSocket as any);

      await processManager.shutdown();

      expect(mockWebSocket.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('WebSocket closed: wsConnection')
      );
    });
  });
});
