/**
 * 配信情報APIのRoute Handler
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

    // TODO: 実際のYouTube APIから配信情報を取得
    // 現在はモックデータを返す
    const streamInfo = {
      title: 'プログラミング配信 #42',
      viewerCount: 1234,
      duration: formatDuration(Date.now() - 5025000), // 約1時間23分
      chatId: 'abc123',
    };

    return NextResponse.json(streamInfo);
  } catch (error) {
    console.error('Failed to fetch stream info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stream info' },
      { status: 500 }
    );
  }
}

function formatDuration(startTime: number): string {
  const duration = Date.now() - startTime;
  const hours = Math.floor(duration / 3600000);
  const minutes = Math.floor((duration % 3600000) / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
