/**
 * Tsumiki AITDD - Green Phase
 * タスク43: OAuthサーバー実装
 */

import * as http from 'http';
import * as url from 'url';
import { EventEmitter } from 'events';
import { Logger } from '../logging/logger';

export interface OAuthServerOptions {
  port?: number;
  timeout?: number;
  logger?: Logger;
  successHtml?: string;
  errorHtml?: string;
}

export class OAuthServer extends EventEmitter {
  private options: OAuthServerOptions;
  private server?: http.Server;
  private logger?: Logger;
  private authCodeResolve?: (code: string) => void;
  private authCodeReject?: (error: Error) => void;
  private authCodeReceived = false;

  constructor(options: OAuthServerOptions = {}) {
    super();
    
    this.options = {
      port: 3000,
      timeout: 300000, // 5分
      ...options,
    };

    this.logger = options.logger;
  }

  async start(): Promise<http.Server> {
    if (this.server) {
      throw new Error('OAuth server is already running');
    }

    this.server = http.createServer(this.handleRequest.bind(this));

    return new Promise((resolve, reject) => {
      this.server!.on('error', reject);
      
      this.server!.listen(this.options.port, () => {
        const address = this.server!.address();
        const port = typeof address === 'object' ? address?.port : this.options.port;
        
        this.logger?.info(`OAuth server started on port ${port}`);
        resolve(this.server!);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      this.logger?.warn('OAuth server is not running');
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = undefined;
        this.authCodeReceived = false;
        this.logger?.info('OAuth server stopped');
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return !!this.server;
  }

  async waitForAuthCode(): Promise<string> {
    if (this.authCodeReceived) {
      throw new Error('Authentication already completed');
    }

    return new Promise((resolve, reject) => {
      this.authCodeResolve = resolve;
      this.authCodeReject = reject;

      // タイムアウトを設定
      const timeout = setTimeout(() => {
        this.authCodeReject = undefined;
        this.authCodeResolve = undefined;
        reject(new Error('OAuth authentication timeout'));
      }, this.options.timeout!);

      // 認証コード受信時にタイムアウトをクリア
      const originalResolve = resolve;
      this.authCodeResolve = (code: string) => {
        clearTimeout(timeout);
        this.authCodeReceived = true;
        originalResolve(code);
      };

      const originalReject = reject;
      this.authCodeReject = (error: Error) => {
        clearTimeout(timeout);
        originalReject(error);
      };
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // CORS ヘッダーを設定
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      const parsedUrl = url.parse(req.url || '', true);
      const pathname = parsedUrl.pathname;

      // リクエストメソッドの確認
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method not allowed');
        return;
      }

      switch (pathname) {
        case '/oauth2callback':
          this.handleOAuthCallback(parsedUrl.query, res);
          break;
        
        case '/health':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
          break;
        
        default:
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
      }
    } catch (error) {
      this.logger?.error('Request error', error as Error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  }

  private handleOAuthCallback(
    query: url.UrlWithParsedQuery['query'],
    res: http.ServerResponse
  ): void {
    // 既に認証コードを受信している場合
    if (this.authCodeReceived) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.options.errorHtml || this.getDefaultErrorHtml('Authentication already completed'));
      return;
    }

    const code = query.code as string;
    const error = query.error as string;
    const errorDescription = query.error_description as string;

    if (error) {
      // エラーレスポンス
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.options.errorHtml || this.getDefaultErrorHtml(errorDescription || error));

      if (this.authCodeReject) {
        this.authCodeReject(new Error(`OAuth error: ${error}`));
      }
      return;
    }

    if (!code) {
      // 不正なリクエスト
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.options.errorHtml || this.getDefaultErrorHtml('Invalid request: missing authorization code'));
      return;
    }

    // 成功レスポンス
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(this.options.successHtml || this.getDefaultSuccessHtml());

    if (this.authCodeResolve) {
      this.authCodeResolve(code);
    }
  }

  private getDefaultSuccessHtml(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>認証完了</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .success {
            color: #22c55e;
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        h1 {
            margin: 0 0 1rem;
            color: #333;
        }
        p {
            color: #666;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success">✓</div>
        <h1>認証が完了しました</h1>
        <p>このウィンドウを閉じて、アプリケーションに戻ってください。</p>
    </div>
</body>
</html>
    `;
  }

  private getDefaultErrorHtml(error: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>認証エラー</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            max-width: 500px;
        }
        .error {
            color: #ef4444;
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        h1 {
            margin: 0 0 1rem;
            color: #333;
        }
        p {
            color: #666;
            margin: 0 0 0.5rem;
        }
        .error-detail {
            font-family: monospace;
            background: #f5f5f5;
            padding: 0.5rem;
            border-radius: 4px;
            color: #333;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error">✕</div>
        <h1>認証エラー</h1>
        <p>認証中にエラーが発生しました。</p>
        <p class="error-detail">${error}</p>
    </div>
</body>
</html>
    `;
  }
}

