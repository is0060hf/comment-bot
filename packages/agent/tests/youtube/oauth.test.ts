/**
 * Tsumiki AITDD - Red Phase
 * タスク39: YouTube OAuth認証フローのテストケース
 */

import { YouTubeAuth, YouTubeAuthConfig } from '../../src/youtube/auth';
import { OAuth2Client } from 'google-auth-library';
import { Server } from 'http';

// モック
jest.mock('google-auth-library');
jest.mock('open');

describe('YouTubeAuth', () => {
  let auth: YouTubeAuth;
  let mockOAuth2Client: any;
  let config: YouTubeAuthConfig;

  beforeEach(() => {
    mockOAuth2Client = {
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn(),
      credentials: {},
    } as any;

    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => mockOAuth2Client);

    config = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/callback',
      scopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
      oauth2Client: mockOAuth2Client, // モックを渡す
    };

    auth = new YouTubeAuth(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('設定を取得できること', () => {
      const authConfig = auth.getConfig();
      expect(authConfig).toEqual(expect.objectContaining({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
        scopes: config.scopes,
      }));
    });
  });

  describe('authentication flow', () => {
    test('認証URLを生成できること', () => {
      const expectedUrl = 'https://accounts.google.com/o/oauth2/v2/auth?...';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(expectedUrl);

      const authUrl = auth.generateAuthUrl();

      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: config.scopes,
        prompt: 'consent',
      });
      expect(authUrl).toBe(expectedUrl);
    });

    test('認証コードからトークンを取得できること', async () => {
      const authCode = 'test-auth-code';
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
      };

      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: mockTokens,
        res: {} as any,
      });

      const tokens = await auth.getTokenFromCode(authCode);

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith(authCode);
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(mockTokens);
      expect(tokens).toEqual(mockTokens);
    });

    test('トークン取得エラーをハンドリングできること', async () => {
      const authCode = 'invalid-code';
      mockOAuth2Client.getToken.mockRejectedValue(new Error('Invalid authorization code'));

      await expect(auth.getTokenFromCode(authCode)).rejects.toThrow('Invalid authorization code');
    });
  });

  describe('token management', () => {
    test('既存のトークンを設定できること', () => {
      const tokens = {
        access_token: 'existing-access-token',
        refresh_token: 'existing-refresh-token',
        expiry_date: Date.now() + 3600000,
      };

      auth.setCredentials(tokens);

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(tokens);
    });

    test('トークンをリフレッシュできること', async () => {
      const oldTokens = {
        refresh_token: 'old-refresh-token',
      };
      const newTokens = {
        access_token: 'new-access-token',
        refresh_token: 'old-refresh-token',
        expiry_date: Date.now() + 3600000,
      };

      // credentialsにrefresh_tokenを設定
      mockOAuth2Client.credentials = oldTokens;
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens,
        res: {} as any,
      });

      const refreshedTokens = await auth.refreshToken();

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(refreshedTokens).toEqual(newTokens);
    });

    test('リフレッシュトークンがない場合エラーになること', async () => {
      await expect(auth.refreshToken()).rejects.toThrow('No refresh token available');
    });

    test('トークンの有効期限を確認できること', () => {
      const tokens = {
        access_token: 'test-token',
        expiry_date: Date.now() + 3600000, // 1時間後
      };

      mockOAuth2Client.credentials = tokens;
      expect(auth.isTokenExpired()).toBe(false);

      // 期限切れのトークン
      mockOAuth2Client.credentials = {
        access_token: 'test-token',
        expiry_date: Date.now() - 1000, // 1秒前
      };
      expect(auth.isTokenExpired()).toBe(true);
    });
  });

  describe('OAuth server flow', () => {
    let server: Server | null;

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => {
          server!.close(() => resolve());
        });
        server = null;
      }
    });

    test.skip('OAuth認証フローを実行できること', async () => {
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
      const mockAuthCode = 'test-auth-code';
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
      };

      mockOAuth2Client.generateAuthUrl.mockReturnValue(mockAuthUrl);
      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: mockTokens,
        res: {} as any,
      });

      // openモジュールのモック
      jest.mock('open', () => jest.fn());

      // 認証フローの実行（タイムアウト付き）
      const authPromise = auth.authenticate();

      // サーバーが起動するまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      // コールバックURLをシミュレート
      const http = require('http');
      const url = require('url');
      const callbackUrl = `${config.redirectUri}?code=${mockAuthCode}`;
      
      await new Promise<void>((resolve, reject) => {
        http.get(callbackUrl, (res: any) => {
          res.on('end', () => resolve());
          res.on('error', reject);
        }).on('error', reject);
      });

      const tokens = await authPromise;

      expect(open).toHaveBeenCalledWith(mockAuthUrl);
      expect(tokens).toEqual(mockTokens);
    });

    test('認証タイムアウトをハンドリングできること', async () => {
      const shortTimeoutConfig = { ...config, authTimeout: 100 };
      auth = new YouTubeAuth(shortTimeoutConfig);

      mockOAuth2Client.generateAuthUrl.mockReturnValue('https://auth.url');

      await expect(auth.authenticate()).rejects.toThrow('Authentication timeout');
    });
  });

  describe('client access', () => {
    test('OAuth2Clientインスタンスを取得できること', () => {
      const client = auth.getClient();
      expect(client).toBe(mockOAuth2Client);
    });

    test('認証済みかどうか確認できること', () => {
      expect(auth.isAuthenticated()).toBe(false);

      mockOAuth2Client.credentials = {
        access_token: 'test-token',
        refresh_token: 'test-refresh-token',
      };

      expect(auth.isAuthenticated()).toBe(true);
    });
  });
});
