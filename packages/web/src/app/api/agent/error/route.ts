/**
 * エージェントエラー報告API
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentAuth } from '@/lib/auth';
import { agentStore } from '@/lib/agent-store';
import { z } from 'zod';

// エラーバリデーションスキーマ
const ErrorSchema = z.object({
  type: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  timestamp: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const isAuthenticated = await verifyAgentAuth(request);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // リクエストボディの取得
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // バリデーション
    const validationResult = ErrorSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid error data' },
        { status: 400 }
      );
    }

    // エラーを追加
    const success = await agentStore.addError(validationResult.data);

    return NextResponse.json({ success });
  } catch (error) {
    console.error('Failed to report error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
