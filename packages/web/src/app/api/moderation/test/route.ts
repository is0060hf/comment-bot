/**
 * モデレーションテストAPIのRoute Handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { testContentModeration } from '@/lib/moderation';

/**
 * POST /api/moderation/test
 * コンテンツのモデレーションをテスト
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const isAuthenticated = await verifyAuth(request);
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

    // コンテンツの検証
    const { content } = body;
    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    if (typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content must be a string' },
        { status: 400 }
      );
    }

    if (content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Content cannot be empty' },
        { status: 400 }
      );
    }

    if (content.length > 1000) {
      return NextResponse.json(
        { error: 'Content too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    // モデレーションを実行
    const result = await testContentModeration(content);

    // レスポンスにメタデータを追加
    return NextResponse.json({
      success: true,
      result,
      metadata: {
        contentLength: content.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to test moderation:', error);
    return NextResponse.json(
      { 
        error: 'Failed to test moderation',
        success: false,
      },
      { status: 500 }
    );
  }
}
