/**
 * 認証ユーティリティ
 */

import { NextRequest } from 'next/server';

/**
 * リクエストの認証を検証
 * @param request NextRequest
 * @returns 認証が有効かどうか
 */
export async function verifyAuth(request: NextRequest): Promise<boolean> {
  // 開発環境では常に認証成功
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // 本番環境ではヘッダーやCookieをチェック
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  // ベアラートークンの検証（実装は簡略化）
  const token = authHeader.replace('Bearer ', '');
  return validateToken(token);
}

/**
 * エージェントからのリクエストを認証
 * @param request NextRequest
 * @returns 認証が有効かどうか
 */
export async function verifyAgentAuth(request: NextRequest): Promise<boolean> {
  // エージェントキーのチェック
  const agentKey = request.headers.get('X-Agent-Key');
  if (!agentKey) {
    return false;
  }

  // 環境変数からエージェントキーを取得
  const validKey = process.env.AGENT_API_KEY || 'default-agent-key';
  return agentKey === validKey;
}

/**
 * トークンの検証
 * @param token 検証するトークン
 * @returns トークンが有効かどうか
 */
function validateToken(token: string): boolean {
  // TODO: 実際のトークン検証ロジックを実装
  // 現在は簡易的な実装
  return token.length > 0;
}