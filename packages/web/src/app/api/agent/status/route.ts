/**
 * エージェントステータス更新API
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentAuth } from '@/lib/auth';
import { agentStore } from '@/lib/agent-store';
import { z } from 'zod';

// ステータスバリデーションスキーマ
const StatusSchema = z.object({
  agent: z.enum(['running', 'stopped', 'error']),
  stt: z.enum(['connected', 'disconnected', 'connecting']),
  youtube: z.enum(['authenticated', 'unauthenticated', 'error']),
  safety: z.enum(['enabled', 'disabled']),
  uptime: z.number().optional(),
  sessionComments: z.number().optional(),
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
    const validationResult = StatusSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid status data' },
        { status: 400 }
      );
    }

    // ステータスを更新
    const success = await agentStore.updateStatus(validationResult.data);

    return NextResponse.json({ success });
  } catch (error) {
    console.error('Failed to update agent status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
