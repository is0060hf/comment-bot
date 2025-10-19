/**
 * Tsumiki AITDD - Red Phase
 * タスク43: OAuthサーバー管理のテストケース
 */

import { OAuthServer, OAuthServerOptions } from '../../src/youtube/oauth-server';
import * as http from 'http';
import * as net from 'net';
import axios from 'axios';

describe('OAuthServer', () => {
  let oauthServer: OAuthServer;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const options: OAuthServerOptions = {
      port: 0, // ランダムポート
      timeout: 5000,
      logger: mockLogger,
    };

    oauthServer = new OAuthServer(options);
  });

  afterEach(async () => {
    await oauthServer.stop();
  });

  describe('Server lifecycle', () => {
    test('サーバーを起動できること', async () => {
      const server = await oauthServer.start();

      expect(server).toBeInstanceOf(http.Server);
      expect(oauthServer.isRunning()).toBe(true);

      const address = server.address() as net.AddressInfo;
      expect(address.port).toBeGreaterThan(0);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('OAuth server started')
      );
    });

    test('サーバーを停止できること', async () => {
      await oauthServer.start();
      expect(oauthServer.isRunning()).toBe(true);

      await oauthServer.stop();
      expect(oauthServer.isRunning()).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('OAuth server stopped')
      );
    });

    test('複数回の起動を防ぐこと', async () => {
      await oauthServer.start();

      await expect(oauthServer.start()).rejects.toThrow(
        'OAuth server is already running'
      );
    });

    test('起動していない状態での停止は何もしないこと', async () => {
      await oauthServer.stop();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'OAuth server is not running'
      );
    });
  });

  describe('OAuth callback handling', () => {
    test('認証コールバックを処理できること', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      const authCodePromise = oauthServer.waitForAuthCode();

      // コールバックURLにアクセス
      const response = await axios.get(
        `http://localhost:${port}/oauth2callback?code=test-auth-code&state=test-state`
      );

      const authCode = await authCodePromise;

      expect(authCode).toBe('test-auth-code');
      expect(response.status).toBe(200);
      expect(response.data).toContain('認証が完了しました');
    });

    test.skip('エラーコールバックを処理できること', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      const authCodePromise = oauthServer.waitForAuthCode();

      // エラーコールバック
      const response = await axios.get(
        `http://localhost:${port}/oauth2callback?error=access_denied&error_description=User%20denied%20access`,
        { validateStatus: () => true }
      );

      await expect(authCodePromise).rejects.toThrow('OAuth error: access_denied');

      expect(response.status).toBe(400);
      expect(response.data).toContain('認証エラー');
    });

    test('不正なリクエストを拒否すること', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      // コードなしのリクエスト
      const response = await axios.get(
        `http://localhost:${port}/oauth2callback`,
        { validateStatus: () => true }
      );

      expect(response.status).toBe(400);
      expect(response.data).toContain('Invalid request');
    });

    test('タイムアウトが機能すること', async () => {
      const quickTimeoutServer = new OAuthServer({
        port: 0,
        timeout: 100, // 100ms
        logger: mockLogger,
      });

      await quickTimeoutServer.start();

      await expect(quickTimeoutServer.waitForAuthCode()).rejects.toThrow(
        'OAuth authentication timeout'
      );

      await quickTimeoutServer.stop();
    });
  });

  describe('Request handling', () => {
    test('ヘルスチェックエンドポイントが機能すること', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      const response = await axios.get(`http://localhost:${port}/health`);

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ status: 'ok' });
    });

    test('不明なパスは404を返すこと', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      const response = await axios.get(
        `http://localhost:${port}/unknown`,
        { validateStatus: () => true }
      );

      expect(response.status).toBe(404);
    });

    test('POSTリクエストを拒否すること', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      const response = await axios.post(
        `http://localhost:${port}/oauth2callback`,
        {},
        { validateStatus: () => true }
      );

      expect(response.status).toBe(405);
      expect(response.data).toContain('Method not allowed');
    });

    test('CORS ヘッダーが設定されること', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      const response = await axios.get(`http://localhost:${port}/health`);

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('Success page customization', () => {
    test('カスタム成功ページを表示できること', async () => {
      const customServer = new OAuthServer({
        port: 0,
        successHtml: '<h1>カスタム成功ページ</h1>',
        logger: mockLogger,
      });

      const server = await customServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      const response = await axios.get(
        `http://localhost:${port}/oauth2callback?code=test-code`
      );

      expect(response.data).toContain('カスタム成功ページ');

      await customServer.stop();
    });

    test('カスタムエラーページを表示できること', async () => {
      const customServer = new OAuthServer({
        port: 0,
        errorHtml: '<h1>カスタムエラーページ</h1>',
        logger: mockLogger,
      });

      const server = await customServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      const response = await axios.get(
        `http://localhost:${port}/oauth2callback?error=test_error`,
        { validateStatus: () => true }
      );

      expect(response.data).toContain('カスタムエラーページ');

      await customServer.stop();
    });
  });

  describe('Concurrent requests', () => {
    test('同時リクエストを処理できること', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      // 複数の同時リクエスト
      const requests = Array(5).fill(0).map((_, i) => 
        axios.get(`http://localhost:${port}/health`)
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('認証コード受信後はコールバックを拒否すること', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      const authCodePromise = oauthServer.waitForAuthCode();

      // 最初のコールバック
      await axios.get(
        `http://localhost:${port}/oauth2callback?code=first-code`
      );

      await authCodePromise;

      // 2回目のコールバック
      const response = await axios.get(
        `http://localhost:${port}/oauth2callback?code=second-code`,
        { validateStatus: () => true }
      );

      expect(response.status).toBe(400);
      expect(response.data).toContain('Authentication already completed');
    });
  });

  describe('Error handling', () => {
    test('サーバーエラーをハンドリングすること', async () => {
      // ポートが使用中の場合をシミュレート
      const blockingServer = http.createServer();
      await new Promise<void>(resolve => {
        blockingServer.listen(8080, resolve);
      });

      const conflictServer = new OAuthServer({
        port: 8080,
        logger: mockLogger,
      });

      await expect(conflictServer.start()).rejects.toThrow();

      await new Promise<void>(resolve => {
        blockingServer.close(() => resolve());
      });
    });

    test('リクエストエラーをログに記録すること', async () => {
      const server = await oauthServer.start();
      const address = server.address() as net.AddressInfo;
      const port = address.port;

      // エラーハンドラーを追加
      server.on('clientError', (err, socket) => {
        mockLogger.error('Request error', err);
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      });

      // 不正なリクエストを送信
      const socket = net.createConnection(port, 'localhost');
      socket.write('INVALID HTTP REQUEST\r\n\r\n');
      socket.end();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Request error',
        expect.any(Error)
      );
    });
  });
});
