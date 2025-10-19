/**
 * Tsumiki AITDD - Refactor Phase
 * タスク43: プロセス管理の統合テスト
 */

import { ProcessManager } from '../../src/core/process-manager';
import { OAuthServer } from '../../src/youtube/oauth-server';
import { Logger, LogLevel } from '../../src/logging/logger';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

describe('Process Management Integration', () => {
  let processManager: ProcessManager;
  let oauthServer: OAuthServer;
  let logger: Logger;
  let mockExit: jest.SpyInstance;
  const testLogDir = path.join(process.cwd(), 'tests', 'integration', 'test-logs');

  beforeEach(() => {
    // テスト用ディレクトリを作成
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });

    // process.exitをモック
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    });

    logger = new Logger({
      level: LogLevel.INFO,
      logDir: testLogDir,
      console: false,
    });

    processManager = new ProcessManager({
      logger,
      gracefulShutdownTimeout: 5000,
      exitOnError: false,
    });

    oauthServer = new OAuthServer({
      port: 0,
      timeout: 5000,
      logger,
    });
  });

  afterEach(async () => {
    processManager.stop();
    await oauthServer.stop();
    logger.close();
    mockExit.mockRestore();
    
    // プロセスリスナーをクリーンアップ
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
  });

  test('OAuthサーバーとプロセス管理の統合', async () => {
    processManager.start();

    // OAuthサーバーを起動
    const server = await oauthServer.start();
    const address = server.address() as any;
    const port = address.port;

    // プロセスマネージャーにHTTPサーバーを登録
    processManager.registerHttpServer('oauth', server);

    // サーバーが動作していることを確認
    const response = await axios.get(`http://localhost:${port}/health`);
    expect(response.status).toBe(200);

    // シャットダウンイベントをシミュレート
    const shutdownSpy = jest.fn();
    processManager.on('shutdown', shutdownSpy);

    process.emit('SIGINT');

    // シャットダウンが完了するまで待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(shutdownSpy).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(130);
    expect(oauthServer.isRunning()).toBe(false);
  });

  test('クリーンアップタスクの実行順序', async () => {
    const executionOrder: string[] = [];

    // 複数のクリーンアップタスクを登録
    processManager.registerCleanupTask('task1', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      executionOrder.push('task1');
    });

    processManager.registerCleanupTask('task2', async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      executionOrder.push('task2');
    });

    processManager.registerCleanupTask('task3', async () => {
      executionOrder.push('task3');
    });

    processManager.start();

    await processManager.shutdown();

    // すべてのタスクが実行されたことを確認
    expect(executionOrder).toHaveLength(3);
    expect(executionOrder).toContain('task1');
    expect(executionOrder).toContain('task2');
    expect(executionOrder).toContain('task3');
  });

  test('複数のリソースの管理', async () => {
    processManager.start();

    // 各種リソースを登録
    const timer = setTimeout(() => {}, 10000);
    const interval = setInterval(() => {}, 1000);
    
    processManager.registerTimer('longTimer', timer);
    processManager.registerInterval('periodicTask', interval);

    // ファイルハンドルのモック
    const mockFileHandle = {
      close: jest.fn().mockResolvedValue(undefined),
    };
    processManager.registerFileHandle('dataFile', mockFileHandle as any);

    // WebSocketのモック
    const mockWebSocket = {
      close: jest.fn(),
      readyState: 1,
    };
    processManager.registerWebSocket('liveConnection', mockWebSocket as any);

    // HTTPサーバー
    const httpServer = http.createServer();
    await new Promise<void>(resolve => {
      httpServer.listen(0, resolve);
    });
    processManager.registerHttpServer('apiServer', httpServer);

    // グレースフルシャットダウン
    await processManager.shutdown();

    // すべてのリソースがクリーンアップされたことを確認
    expect(mockFileHandle.close).toHaveBeenCalled();
    expect(mockWebSocket.close).toHaveBeenCalled();
    expect(httpServer.listening).toBe(false);
  });

  test('エラー発生時のログ記録', async () => {
    processManager.start();

    // エラーを発生させるクリーンアップタスク
    processManager.registerCleanupTask('errorTask', async () => {
      throw new Error('Cleanup error');
    });

    // エラーが発生してもシャットダウンが完了することを確認
    await processManager.shutdown();

    // ログファイルを確認
    await new Promise(resolve => setTimeout(resolve, 100));

    const logFiles = fs.readdirSync(testLogDir);
    expect(logFiles.length).toBeGreaterThan(0);

    const logContent = fs.readFileSync(
      path.join(testLogDir, logFiles[0]!),
      'utf-8'
    );

    expect(logContent).toContain('Cleanup task failed');
    expect(logContent).toContain('errorTask');
    expect(logContent).toContain('Cleanup error');
  });

  test('OAuthフローとグレースフルシャットダウン', async () => {
    processManager.start();

    // OAuthサーバーを起動
    const server = await oauthServer.start();
    const address = server.address() as any;
    const port = address.port;

    processManager.registerHttpServer('oauth', server);

    // OAuth認証フローを開始
    const authCodePromise = oauthServer.waitForAuthCode();

    // 認証コールバックを送信
    axios.get(
      `http://localhost:${port}/oauth2callback?code=test-code`
    ).catch(() => {}); // エラーは無視

    // 認証コードを受信
    const authCode = await authCodePromise;
    expect(authCode).toBe('test-code');

    // その後シャットダウン
    await processManager.shutdown();

    // サーバーが停止していることを確認
    await expect(
      axios.get(`http://localhost:${port}/health`)
    ).rejects.toThrow();
  });

  test('タイムアウト時のフォースシャットダウン', async () => {
    jest.useFakeTimers();

    // タイムアウトの短いプロセスマネージャー
    const quickManager = new ProcessManager({
      logger,
      gracefulShutdownTimeout: 100,
      exitOnError: false,
    });

    // 長時間かかるクリーンアップタスク
    quickManager.registerCleanupTask('slowTask', async () => {
      await new Promise(resolve => setTimeout(resolve, 10000));
    });

    quickManager.start();

    const shutdownPromise = quickManager.shutdown();

    // タイムアウトまで時間を進める
    await jest.advanceTimersByTimeAsync(100);

    await shutdownPromise;

    // タイムアウトログを確認
    await jest.advanceTimersByTimeAsync(100);

    const logFiles = fs.readdirSync(testLogDir);
    const logContent = fs.readFileSync(
      path.join(testLogDir, logFiles[0]!),
      'utf-8'
    );

    expect(logContent).toContain('timeout');
    expect(mockExit).toHaveBeenCalledWith(0);

    quickManager.stop();
    jest.useRealTimers();
  });
});

