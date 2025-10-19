/**
 * システムステータスAPIのRoute Handler
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

    // agentStoreからステータスを取得
    const status = agentStore.getStatus();

    return NextResponse.json(status);
  } catch (error) {
    console.error('Failed to fetch status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
