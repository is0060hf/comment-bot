/**
 * 最近のコメント取得APIのRoute Handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { agentStore } from '@/lib/agent-store';

export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const isAuthenticated = await verifyAuth(request);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // agentStoreから最近のコメントを取得
    const comments = agentStore.getRecentComments(20);

    return NextResponse.json(comments);
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}
