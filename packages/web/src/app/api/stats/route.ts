/**
 * 統計情報APIのRoute Handler
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

    // agentStoreから統計情報を取得
    const stats = agentStore.getStats();
    const status = agentStore.getStatus();

    const responseData = {
      totalComments: stats.totalComments,
      sessionComments: stats.sessionComments,
      averageInterval: 45, // TODO: 実際の平均間隔を計算
      uptime: stats.uptime,
    };

    return NextResponse.json(responseData);
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
