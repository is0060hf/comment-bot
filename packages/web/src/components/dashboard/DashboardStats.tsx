/**
 * ダッシュボード統計情報コンポーネント
 */

import React from 'react';

interface DashboardStatsProps {
  stats: {
    totalComments: number;
    sessionComments: number;
    averageInterval: number;
    uptime: string;
  };
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center">
        <div className="text-sm text-gray-600">総コメント数</div>
        <div className="text-2xl font-bold">{stats.totalComments}</div>
      </div>
      
      <div className="text-center">
        <div className="text-sm text-gray-600">セッション中</div>
        <div className="text-2xl font-bold">{stats.sessionComments}</div>
      </div>
      
      <div className="text-center">
        <div className="text-sm text-gray-600">平均間隔</div>
        <div className="text-2xl font-bold">{stats.averageInterval}秒</div>
      </div>
      
      <div className="text-center">
        <div className="text-sm text-gray-600">稼働時間</div>
        <div className="text-2xl font-bold">{stats.uptime}</div>
      </div>
    </div>
  );
}
