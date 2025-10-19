/**
 * Tsumiki AITDD - Red Phase
 * タスク9: ロガーのテストケース
 */

import { Logger, LoggerConfig, LogLevel } from '../../src/logging/logger';
import * as fs from 'fs';
import * as path from 'path';

describe('Logger', () => {
  let logger: Logger;
  let config: LoggerConfig;
  const testLogDir = path.join(process.cwd(), 'tests', 'logging', 'test-logs');

  beforeEach(() => {
    // テスト用ディレクトリを作成
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });

    config = {
      level: LogLevel.INFO,
      logDir: testLogDir,
      maxFileSize: 1024 * 1024, // 1MB
      maxFiles: 3,
      console: false, // テスト時はコンソール出力を無効化
    };

    logger = new Logger(config);
  });

  afterEach(() => {
    logger.close();
    // テスト用ディレクトリを削除
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
  });

  describe('log levels', () => {
    test('各レベルでログを出力できること', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      // コンソール出力を有効化
      logger = new Logger({ ...config, console: true });

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      // INFOレベルなのでDEBUGは出力されない
      expect(consoleSpy).toHaveBeenCalledTimes(2); // INFO, WARN
      expect(errorSpy).toHaveBeenCalledTimes(1); // ERROR

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('ログレベルによるフィルタリングが機能すること', () => {
      // ERRORレベルに設定
      logger.setLevel(LogLevel.ERROR);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      logger = new Logger({ ...config, level: LogLevel.ERROR, console: true });

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warning');
      logger.error('Error');

      // ERRORのみ出力される
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });

  describe('PII masking', () => {
    test('メールアドレスがマスクされること', () => {
      const message = 'User email is test@example.com';
      const masked = logger.info(message);
      
      expect(masked).not.toContain('test@example.com');
      expect(masked).toContain('[EMAIL]');
    });

    test('電話番号がマスクされること', () => {
      const messages = [
        'Phone: 090-1234-5678',
        'Tel: 03-1234-5678',
        'Contact: +81-90-1234-5678',
      ];

      messages.forEach(msg => {
        const masked = logger.info(msg);
        expect(masked).toContain('[PHONE]');
        expect(masked).not.toMatch(/\d{2,4}-\d{2,4}-\d{4}/);
      });
    });

    test('IPアドレスがマスクされること', () => {
      const messages = [
        'Client IP: 192.168.1.1',
        'Server: 10.0.0.1:8080',
      ];

      messages.forEach(msg => {
        const masked = logger.info(msg);
        expect(masked).toContain('[IP]');
        expect(masked).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
      });
    });

    test('URLのクエリパラメータがマスクされること', () => {
      const url = 'https://api.example.com/auth?token=abc123&user=john';
      const masked = logger.info(`API call to ${url}`);
      
      expect(masked).toContain('https://api.example.com/auth');
      expect(masked).toContain('[PARAMS]');
      expect(masked).not.toContain('abc123');
      expect(masked).not.toContain('john');
    });
  });

  describe('file logging', () => {
    test('ログファイルに書き込まれること', async () => {
      // 新しいロガーインスタンスを作成
      const testLogger = new Logger({
        level: LogLevel.INFO,
        logDir: testLogDir,
        console: false,
      });
      
      testLogger.info('Test message');
      
      // ファイルが作成されるまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      const logFiles = fs.readdirSync(testLogDir);
      expect(logFiles.length).toBeGreaterThan(0);

      const logContent = fs.readFileSync(
        path.join(testLogDir, logFiles[logFiles.length - 1]!),
        'utf-8'
      );
      expect(logContent).toMatch(/Test message/);
      
      testLogger.close();
    });

    test('ファイルサイズ制限が機能すること', async () => {
      // 小さいファイルサイズ制限でロガーを作成
      logger.close();
      logger = new Logger({
        ...config,
        maxFileSize: 50, // 50バイト
      });

      // 大量のログを出力
      for (let i = 0; i < 10; i++) {
        logger.info(`Long message ${i}: ${'x'.repeat(100)}`);
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const logFiles = fs.readdirSync(testLogDir);
      // 複数のファイルが作成される
      expect(logFiles.length).toBeGreaterThan(1);
    });

    test('最大ファイル数制限が機能すること', async () => {
      logger.close();
      logger = new Logger({
        ...config,
        maxFileSize: 100,
        maxFiles: 2,
      });

      // 大量のログを出力
      for (let i = 0; i < 20; i++) {
        logger.info(`Message ${i}: ${'x'.repeat(50)}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const logFiles = fs.readdirSync(testLogDir);
      // 最大2ファイルまで
      expect(logFiles.length).toBeLessThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    test('エラーオブジェクトをログできること', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Test.js:10:5';

      const logged = logger.error('Operation failed', error);
      
      expect(logged).toContain('Operation failed');
      expect(logged).toContain('Test error');
      expect(logged).toContain('Test.js:10:5');
    });

    test('追加のコンテキスト情報を含められること', () => {
      const context = {
        userId: 'user123',
        operation: 'postComment',
        timestamp: Date.now(),
      };

      const logged = logger.error('Failed to post', new Error('Network error'), context);
      
      expect(logged).toContain('Failed to post');
      expect(logged).toContain('Network error');
      expect(logged).toContain('postComment');
      expect(logged).toContain('user123');
    });
  });

  describe('performance', () => {
    test('通常運用時はログを出力しないこと', () => {
      // PRODUCTIONモードをシミュレート
      logger.close();
      logger = new Logger({
        ...config,
        level: LogLevel.ERROR,
        console: false,
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      // 通常のログは出力されない
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warning');

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();

      // エラーのみ出力
      logger.error('Error occurred');
      
      // ファイルには書き込まれるがコンソールには出ない
      expect(errorSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('configuration', () => {
    test('設定を動的に変更できること', () => {
      expect(logger.getLevel()).toBe(LogLevel.INFO);

      logger.setLevel(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);

      logger.setConsoleOutput(true);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // DEBUGはコンソールに出力されない（INFO以上のみ）
      logger.debug('Debug message');
      expect(consoleSpy).not.toHaveBeenCalled();
      
      // INFOは出力される
      logger.info('Info message');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('環境変数から設定を読み込めること', () => {
      process.env.LOG_LEVEL = 'debug';
      process.env.LOG_DIR = '/tmp/logs';

      const envLogger = Logger.fromEnv();
      expect(envLogger.getLevel()).toBe(LogLevel.DEBUG);

      delete process.env.LOG_LEVEL;
      delete process.env.LOG_DIR;
      envLogger.close();
    });
  });

  describe('retention', () => {
    test('古いログファイルが削除されること', async () => {
      // 古いファイルを作成
      const oldFile = path.join(testLogDir, 'old.log');
      fs.writeFileSync(oldFile, 'old content');
      
      // 最終更新日を7日以上前に設定
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 8);
      fs.utimesSync(oldFile, oldDate, oldDate);

      // クリーンアップを実行
      await logger.cleanup();

      const files = fs.readdirSync(testLogDir);
      expect(files).not.toContain('old.log');
    });
  });
});
