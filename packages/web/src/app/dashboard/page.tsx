/**
 * ダッシュボードページ
 */

'use client';

import React, { useState, useEffect } from 'react';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { StatusIndicator } from '@/components/dashboard/StatusIndicator';
import { RecentComments } from '@/components/dashboard/RecentComments';
import { StreamInfo } from '@/components/dashboard/StreamInfo';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardData {
  stats: any;
  status: any;
  comments: any[];
  streamInfo: any;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 並列でデータを取得
        const [stats, status, comments, streamInfo] = await Promise.all([
          apiClient.get('/api/stats'),
          apiClient.get('/api/status'),
          apiClient.get('/api/comments/recent'),
          apiClient.get('/api/stream/info'),
        ]);

        setData({ stats, status, comments, streamInfo });
      } catch (err) {
        setError('エラーが発生しました');
        console.error('Dashboard data fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // 30秒ごとに更新
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">ダッシュボード</h1>

      <div className="grid gap-6">
        {/* 統計情報 */}
        <Card>
          <CardHeader>
            <CardTitle>統計情報</CardTitle>
          </CardHeader>
          <CardContent>
            {data && <DashboardStats stats={data.stats} />}
          </CardContent>
        </Card>

        {/* システムステータス */}
        <Card>
          <CardHeader>
            <CardTitle>システムステータス</CardTitle>
          </CardHeader>
          <CardContent>
            {data && <StatusIndicator status={data.status} />}
          </CardContent>
        </Card>

        {/* 最近のコメント */}
        <Card>
          <CardHeader>
            <CardTitle>最近のコメント</CardTitle>
          </CardHeader>
          <CardContent>
            {data && <RecentComments comments={data.comments} />}
          </CardContent>
        </Card>

        {/* 配信情報 */}
        <Card>
          <CardHeader>
            <CardTitle>配信情報</CardTitle>
          </CardHeader>
          <CardContent>
            {data && <StreamInfo info={data.streamInfo} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
