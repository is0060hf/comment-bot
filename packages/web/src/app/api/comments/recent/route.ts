/**
 * 最近のコメント取得APIのRoute Handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const isAuthenticated = await verifyAuth(request);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: 実際のエージェントから最近のコメントを取得
    // 現在はモックデータを返す
    const comments = [
      {
        id: '1',
        content: 'すごく面白い配信ですね！',
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        status: 'posted',
      },
      {
        id: '2',
        content: 'なるほど、勉強になります',
        timestamp: new Date(Date.now() - 60000).toISOString(),
        confidence: 0.85,
        status: 'posted',
      },
      {
        id: '3',
        content: '質問があります',
        timestamp: new Date(Date.now() - 120000).toISOString(),
        confidence: 0.75,
        status: 'posted',
      },
    ];

    return NextResponse.json(comments);
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}
