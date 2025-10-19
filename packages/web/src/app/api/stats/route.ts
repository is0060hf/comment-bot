/**
 * 統計情報APIのRoute Handler
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

    // TODO: 実際のエージェントから統計情報を取得
    // 現在はモックデータを返す
    const stats = {
      totalComments: Math.floor(Math.random() * 100) + 1,
      sessionComments: Math.floor(Math.random() * 20),
      averageInterval: Math.floor(Math.random() * 60) + 30,
      uptime: formatUptime(Date.now() - Math.random() * 10000000),
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}

function formatUptime(startTime: number): string {
  const duration = Date.now() - startTime;
  const hours = Math.floor(duration / 3600000);
  const minutes = Math.floor((duration % 3600000) / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
