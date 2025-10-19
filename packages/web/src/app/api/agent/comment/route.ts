/**
 * エージェントコメント報告API
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentAuth } from '@/lib/auth';
import { agentStore } from '@/lib/agent-store';
import { z } from 'zod';

// コメントバリデーションスキーマ
const CommentSchema = z.object({
  content: z.string().min(1),
  confidence: z.number().min(0).max(1),
  status: z.enum(['posted', 'blocked', 'pending']),
  blockReason: z.string().optional(),
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
    const validationResult = CommentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid comment data' },
        { status: 400 }
      );
    }

    // コメントを追加
    const id = await agentStore.addComment(validationResult.data);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Failed to report comment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
