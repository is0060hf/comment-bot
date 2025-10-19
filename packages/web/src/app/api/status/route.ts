/**
 * システムステータスAPIのRoute Handler
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

    // TODO: 実際のエージェントからステータスを取得
    // 現在はモックデータを返す
    const status = {
      agent: 'running',
      stt: 'connected',
      youtube: 'authenticated',
      safety: 'enabled',
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error('Failed to fetch status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
