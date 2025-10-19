/**
 * 最近のコメント表示コンポーネント
 */

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface Comment {
  id: string;
  content: string;
  timestamp: string;
  confidence: number;
  status: 'posted' | 'blocked' | 'pending';
  blockReason?: string;
}

interface RecentCommentsProps {
  comments: Comment[];
}

export function RecentComments({ comments }: RecentCommentsProps) {
  if (comments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        まだコメントがありません
      </div>
    );
  }

  const getStatusBadge = (comment: Comment) => {
    switch (comment.status) {
      case 'posted':
        return <Badge variant="default">投稿済み</Badge>;
      case 'blocked':
        return <Badge variant="destructive">ブロック済み</Badge>;
      case 'pending':
        return <Badge variant="secondary">保留中</Badge>;
      default:
        return null;
    }
  };

  const getBlockReasonText = (reason?: string) => {
    const reasonMap: Record<string, string> = {
      safety_filter: '安全フィルター',
      ng_word: 'NGワード',
      rate_limit: 'レート制限',
      low_confidence: '信頼度低',
    };
    return reason ? reasonMap[reason] || reason : '';
  };

  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <div
          key={comment.id}
          className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm">{comment.content}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>
                  {formatDistanceToNow(new Date(comment.timestamp), {
                    addSuffix: true,
                    locale: ja,
                  })}
                </span>
                <span>{Math.round(comment.confidence * 100)}%</span>
                {comment.blockReason && (
                  <span className="text-red-600">
                    {getBlockReasonText(comment.blockReason)}
                  </span>
                )}
              </div>
            </div>
            <div>{getStatusBadge(comment)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
