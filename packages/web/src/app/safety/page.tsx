/**
 * 安全設定ページ
 */

'use client';

import React, { useState, useEffect } from 'react';
import { SafetySettingsForm } from '@/components/safety/SafetySettingsForm';
import { ModerationTest } from '@/components/safety/ModerationTest';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SafetyData {
  safety?: any;
}

export default function SafetyPage() {
  const [data, setData] = useState<SafetyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const settings = await apiClient.get('/api/config?section=safety');
        setData(settings);
      } catch (err) {
        setError('エラーが発生しました');
        console.error('Failed to fetch safety settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
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
      <h1 className="text-3xl font-bold mb-8">安全設定</h1>

      <div className="grid gap-6">
        {/* 安全レベル設定 */}
        <Card>
          <CardHeader>
            <CardTitle>安全レベル設定</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.safety && (
              <SafetySettingsForm initialData={data.safety} />
            )}
          </CardContent>
        </Card>

        {/* モデレーションテスト */}
        <Card>
          <CardHeader>
            <CardTitle>モデレーションテスト</CardTitle>
          </CardHeader>
          <CardContent>
            <ModerationTest />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
