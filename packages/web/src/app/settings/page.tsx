/**
 * 設定ページ
 */

'use client';

import React, { useState, useEffect } from 'react';
import { CommentSettingsForm } from '@/components/settings/CommentSettingsForm';
import { TimingSettingsForm } from '@/components/settings/TimingSettingsForm';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SettingsData {
  comment?: any;
  timing?: any;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const settings = await apiClient.get('/api/config');
        setData(settings);
      } catch (err) {
        setError('エラーが発生しました');
        console.error('Failed to fetch settings:', err);
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
      <h1 className="text-3xl font-bold mb-8">設定</h1>

      <Tabs defaultValue="comment" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="comment">コメント設定</TabsTrigger>
          <TabsTrigger value="timing">タイミング設定</TabsTrigger>
        </TabsList>

        <TabsContent value="comment">
          <Card>
            <CardHeader>
              <CardTitle>コメント設定</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.comment && (
                <CommentSettingsForm initialData={data.comment} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timing">
          <Card>
            <CardHeader>
              <CardTitle>タイミング設定</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.timing && (
                <TimingSettingsForm initialData={data.timing} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
