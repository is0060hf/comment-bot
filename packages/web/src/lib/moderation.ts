/**
 * モデレーションユーティリティ
 */

import { ModerationResult } from '../shared/types';

/**
 * コンテンツのモデレーションをテスト
 * @param content テストするコンテンツ
 * @returns モデレーション結果
 */
export async function testContentModeration(content: string): Promise<ModerationResult> {
  // 開発環境では簡易的なモック実装
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    // 特定のキーワードでフラグを立てる
    const inappropriateKeywords = ['不適切', 'NG', 'bad'];
    const isInappropriate = inappropriateKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );

    if (isInappropriate) {
      return {
        flagged: true,
        categories: ['hate', 'harassment'] as any[],
        scores: {
          hate: 0.9,
          harassment: 0.85,
          'self-harm': 0.0,
          sexual: 0.0,
          violence: 0.1,
          illegal: 0.0,
          graphic: 0.0,
        },
        suggestedAction: 'block',
        provider: 'mock',
      };
    }

    return {
      flagged: false,
      categories: [],
      scores: {
        hate: 0.1,
        harassment: 0.1,
        'self-harm': 0.0,
        sexual: 0.0,
        violence: 0.1,
        illegal: 0.0,
        graphic: 0.0,
      },
      suggestedAction: 'approve',
      provider: 'mock',
    };
  }

  // 本番環境では実際のモデレーションAPIを呼び出す
  const response = await fetch('/api/agent/moderation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error('Moderation API request failed');
  }

  return response.json();
}
