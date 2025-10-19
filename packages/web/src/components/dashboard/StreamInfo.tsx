/**
 * 配信情報表示コンポーネント
 */

import React from 'react';

interface StreamInfoData {
  title: string;
  viewerCount: number;
  duration: string;
  chatId: string;
}

interface StreamInfoProps {
  info: StreamInfoData | null;
}

export function StreamInfo({ info }: StreamInfoProps) {
  if (!info) {
    return (
      <div className="text-center py-8 text-gray-500">
        配信情報なし
      </div>
    );
  }

  const formatViewerCount = (count: number) => {
    return count.toLocaleString('ja-JP') + '人';
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-gray-600">配信タイトル</div>
        <div className="text-lg font-medium">{info.title}</div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-sm text-gray-600">視聴者数</div>
          <div className="text-lg font-medium">
            {formatViewerCount(info.viewerCount)}
          </div>
        </div>
        
        <div>
          <div className="text-sm text-gray-600">配信時間</div>
          <div className="text-lg font-medium">{info.duration}</div>
        </div>
        
        <div>
          <div className="text-sm text-gray-600">チャットID</div>
          <div className="text-sm font-mono text-gray-500">{info.chatId}</div>
        </div>
      </div>
    </div>
  );
}
