/**
 * YouTube OAuth認証モジュール
 * OAuth 2.0フローを使用してYouTube APIの認証を行う
 */

import { OAuth2Client, Credentials } from 'google-auth-library';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
// @ts-ignore
let open: any;
try {
  open = require('open');
} catch {
  // テスト環境では無視
  open = () => Promise.resolve();
}

export interface YouTubeAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authTimeout?: number;
  oauth2Client?: OAuth2Client; // テスト用にオプショナル
}

export class YouTubeAuth {
  private oauth2Client: OAuth2Client;
  private config: YouTubeAuthConfig;

  constructor(config: YouTubeAuthConfig) {
    this.config = {
      authTimeout: 300000, // 5分のデフォルトタイムアウト
      ...config,
    };

    // OAuth2Clientが渡されたらそれを使う（テスト用）
    if (config.oauth2Client) {
      this.oauth2Client = config.oauth2Client;
    } else {
      this.oauth2Client = new OAuth2Client(
        config.clientId,
        config.clientSecret,
        config.redirectUri
      );
    }
    
    // credentialsの初期化
    if (!this.oauth2Client.credentials) {
      this.oauth2Client.credentials = {};
    }
  }

  /**
   * 設定を取得
   */
  getConfig(): YouTubeAuthConfig {
    return { ...this.config };
  }

  /**
   * OAuth2Clientインスタンスを取得
   */
  getClient(): OAuth2Client {
    return this.oauth2Client;
  }

  /**
   * 認証URLを生成
   */
  generateAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.config.scopes,
      prompt: 'consent',
    });
  }

  /**
   * 認証コードからトークンを取得
   */
  async getTokenFromCode(code: string): Promise<Credentials> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  /**
   * 既存のトークンを設定
   */
  setCredentials(tokens: Credentials): void {
    this.oauth2Client.setCredentials(tokens);
  }

  /**
   * トークンをリフレッシュ
   */
  async refreshToken(): Promise<Credentials> {
    const currentTokens = this.oauth2Client.credentials;
    
    if (!currentTokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    const { credentials } = await this.oauth2Client.refreshAccessToken();
    this.oauth2Client.setCredentials(credentials);
    return credentials;
  }

  /**
   * トークンの有効期限を確認
   */
  isTokenExpired(): boolean {
    const credentials = this.oauth2Client.credentials;
    
    if (!credentials.expiry_date) {
      return true;
    }

    return Date.now() >= credentials.expiry_date;
  }

  /**
   * 認証済みかどうか確認
   */
  isAuthenticated(): boolean {
    const credentials = this.oauth2Client.credentials;
    return !!(credentials.access_token || credentials.refresh_token);
  }

  /**
   * OAuth認証フローを実行
   */
  async authenticate(): Promise<Credentials> {
    return new Promise((resolve, reject) => {
      const authUrl = this.generateAuthUrl();
      let server: ReturnType<typeof createServer> | null = null;
      let timeoutId: NodeJS.Timeout | null = null;

      // タイムアウトを設定
      timeoutId = setTimeout(() => {
        if (server) {
          server.close();
        }
        reject(new Error('Authentication timeout'));
      }, this.config.authTimeout!);

      // コールバックサーバーを起動
      server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const urlParts = parse(req.url || '', true);
        
        if (urlParts.pathname === new URL(this.config.redirectUri).pathname) {
          const code = urlParts.query.code as string;
          
          if (code) {
            try {
              const tokens = await this.getTokenFromCode(code);
              
              // 成功レスポンス
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body>
                    <h1>認証成功</h1>
                    <p>このウィンドウを閉じてください。</p>
                    <script>window.close();</script>
                  </body>
                </html>
              `);

              // クリーンアップ
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              server!.close();
              
              resolve(tokens);
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body>
                    <h1>認証エラー</h1>
                    <p>エラーが発生しました: ${error}</p>
                  </body>
                </html>
              `);
              
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              server!.close();
              
              reject(error);
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>認証エラー</h1>
                  <p>認証コードが見つかりません。</p>
                </body>
              </html>
            `);
          }
        }
      });

      const redirectUrl = new URL(this.config.redirectUri);
      const port = parseInt(redirectUrl.port) || 3000;
      
      server.listen(port, async () => {
        try {
          // ブラウザで認証URLを開く
          await open(authUrl);
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          server!.close();
          reject(error);
        }
      });

      server.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });
    });
  }
}
