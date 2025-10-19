/**
 * エージェントコマンド取得API
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentAuth } from '@/lib/auth';
import { agentStore } from '@/lib/agent-store';

export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const isAuthenticated = await verifyAgentAuth(request);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // コマンドを取得
    const commands = await agentStore.getCommands();

    // 取得後にクリア
    if (commands.length > 0) {
      await agentStore.clearCommands();
    }

    return NextResponse.json({ commands });
  } catch (error) {
    console.error('Failed to get commands:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
