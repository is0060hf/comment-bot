/**
 * 設定APIのRoute Handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getConfig, updateConfig } from '@/lib/edge-config';
import { AppConfig } from '@/shared/types';
import { z } from 'zod';

// 設定のバリデーションスキーマ（簡易版）
const ConfigUpdateSchema = z.object({
  comment: z.any().optional(),
  safety: z.any().optional(),
  providers: z.any().optional(),
  youtube: z.any().optional(),
}).strict();

/**
 * GET /api/config
 * 現在の設定を取得
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const isAuthenticated = await verifyAuth(request);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // セクションパラメータの取得
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');

    // 設定を取得
    const config = await getConfig();

    // セクションが指定されている場合はその部分のみ返す
    if (section && section in config) {
      return NextResponse.json({ [section]: config[section as keyof AppConfig] });
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error('Failed to fetch configuration:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config
 * 設定を更新
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
        { error: 'Invalid configuration format' },
        { status: 400 }
      );
    }

    // バリデーション
    const validationResult = ConfigUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid configuration format' },
        { status: 400 }
      );
    }

    // センシティブなデータの削除
    const sanitizedConfig = { ...validationResult.data };
    if ('youtube' in sanitizedConfig) {
      const { clientId, clientSecret, refreshToken, ...safeYoutubeConfig } = 
        sanitizedConfig.youtube || {};
      if (Object.keys(safeYoutubeConfig).length > 0) {
        sanitizedConfig.youtube = safeYoutubeConfig;
      } else {
        delete sanitizedConfig.youtube;
      }
    }

    // 設定を更新
    const result = await updateConfig(sanitizedConfig);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to update configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to update configuration:', error);
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    );
  }
}
