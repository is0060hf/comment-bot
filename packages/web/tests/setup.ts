/**
 * Jest セットアップファイル
 */

import '@testing-library/jest-dom';

// Next.js環境のモック
jest.mock('next/server', () => ({
  NextRequest: class NextRequest {
    constructor(url: string, init?: RequestInit) {
      this.url = url;
      this.method = init?.method || 'GET';
      this.headers = new Map();
      this.body = init?.body;
    }

    async json() {
      if (typeof this.body === 'string') {
        return JSON.parse(this.body);
      }
      return this.body;
    }
  },
  NextResponse: {
    json: (body: any, init?: ResponseInit) => ({
      json: async () => body,
      status: init?.status || 200,
      headers: init?.headers || {},
    }),
  },
}));

// グローバルなfetchのモック
global.fetch = jest.fn();

// 環境変数の設定
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
process.env.VERCEL_ENV = 'test';

// ResizeObserverのモック
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// コンソールエラーのモック（テスト中の不要なログを抑制）
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});
