/**
 * モデレーションテストコンポーネント
 */

'use client';

import React, { useState } from 'react';
import { testModeration } from '@/app/actions/safety';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface ModerationResult {
  flagged: boolean;
  categories: string[];
  scores: Record<string, number>;
  suggestedAction: 'approve' | 'block' | 'review';
}

export function ModerationTest() {
  const [text, setText] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ModerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!text.trim()) {
      setError('テキストを入力してください');
      return;
    }

    setError(null);
    setTesting(true);
    setResult(null);

    try {
      const response = await testModeration(text);
      
      if (response.success) {
        setResult(response.result);
      } else {
        setError(response.error || 'テストに失敗しました');
      }
    } catch (err) {
      setError('エラーが発生しました');
      console.error('Moderation test error:', err);
    } finally {
      setTesting(false);
    }
  };

  const categoryLabels: Record<string, string> = {
    hate: 'ヘイトスピーチ',
    harassment: 'ハラスメント',
    'self-harm': '自傷行為',
    sexual: '性的コンテンツ',
    violence: '暴力',
    illegal: '違法行為',
    graphic: 'グラフィックコンテンツ',
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'approve':
        return '承認';
      case 'block':
        return 'ブロック';
      case 'review':
        return 'レビュー必要';
      default:
        return action;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'approve':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'block':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'review':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          placeholder="テストするテキストを入力"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full"
        />
        <Button
          onClick={handleTest}
          disabled={testing || !text.trim()}
          className="w-full"
        >
          {testing ? 'テスト中...' : 'テスト実行'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getActionIcon(result.suggestedAction)}
              判定: {getActionLabel(result.suggestedAction)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* フラグされたカテゴリ */}
            {result.flagged && result.categories.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">
                  検出されたカテゴリ: {result.categories.join(', ')}
                </p>
              </div>
            )}

            {/* スコア詳細 */}
            <div className="space-y-2">
              <p className="text-sm font-medium">カテゴリ別スコア:</p>
              {Object.entries(result.scores).map(([category, score]) => {
                const label = categoryLabels[category] || category;
                const percentage = Math.round(score * 100);
                const isHigh = score > 0.7;
                
                return (
                  <div key={category} className="flex items-center justify-between">
                    <span className="text-sm">{label}:</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            isHigh ? 'bg-red-600' : 'bg-green-600'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className={`text-sm ${isHigh ? 'text-red-600' : ''}`}>
                        {percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 結果サマリー */}
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-600">
                {result.flagged
                  ? 'このコンテンツは安全ガイドラインに違反する可能性があります。'
                  : 'このコンテンツは安全と判定されました。'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
