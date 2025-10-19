/**
 * タイミング設定フォームコンポーネント
 */

'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateSettings } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

// バリデーションスキーマ
const timingSettingsSchema = z.object({
  minimumInterval: z.number()
    .min(0, '0以上の値を入力してください')
    .max(300, '300秒以下の値を入力してください'),
  maxCommentsPerTenMinutes: z.number()
    .min(1, '1以上の値を入力してください')
    .max(20, '20以下の値を入力してください'),
  cooldownAfterBurst: z.number()
    .min(0, '0以上の値を入力してください')
    .max(600, '600秒以下の値を入力してください'),
  deduplicationWindow: z.number()
    .min(0, '0以上の値を入力してください')
    .max(3600, '3600秒以下の値を入力してください'),
});

type TimingSettingsFormData = z.infer<typeof timingSettingsSchema>;

interface TimingSettingsFormProps {
  initialData: any;
}

export function TimingSettingsForm({ initialData }: TimingSettingsFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TimingSettingsFormData>({
    resolver: zodResolver(timingSettingsSchema),
    defaultValues: {
      minimumInterval: initialData.minimumInterval || 30,
      maxCommentsPerTenMinutes: initialData.maxCommentsPerTenMinutes || 5,
      cooldownAfterBurst: initialData.cooldownAfterBurst || 120,
      deduplicationWindow: initialData.deduplicationWindow || 300,
    },
  });

  const onSubmit = async (data: TimingSettingsFormData) => {
    try {
      setSaving(true);
      const result = await updateSettings({
        timing: data,
      });

      if (result.success) {
        toast({
          title: '設定を保存しました',
          description: 'タイミング設定が正常に更新されました',
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: 'エラー',
        description: '設定の保存に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 最小投稿間隔 */}
      <div className="space-y-2">
        <Label htmlFor="minimumInterval">最小投稿間隔（秒）</Label>
        <Input
          id="minimumInterval"
          type="number"
          {...register('minimumInterval', { valueAsNumber: true })}
          min={0}
          max={300}
        />
        <p className="text-sm text-gray-600">
          コメント投稿の最小間隔を設定します
        </p>
        {errors.minimumInterval && (
          <p className="text-sm text-red-600">{errors.minimumInterval.message}</p>
        )}
      </div>

      {/* 10分あたりの最大コメント数 */}
      <div className="space-y-2">
        <Label htmlFor="maxComments">10分あたりの最大コメント数</Label>
        <Input
          id="maxComments"
          type="number"
          {...register('maxCommentsPerTenMinutes', { valueAsNumber: true })}
          min={1}
          max={20}
        />
        <p className="text-sm text-gray-600">
          10分間に投稿できる最大コメント数を設定します
        </p>
        {errors.maxCommentsPerTenMinutes && (
          <p className="text-sm text-red-600">{errors.maxCommentsPerTenMinutes.message}</p>
        )}
      </div>

      {/* 連続投稿後のクールダウン */}
      <div className="space-y-2">
        <Label htmlFor="cooldown">連続投稿後のクールダウン（秒）</Label>
        <Input
          id="cooldown"
          type="number"
          {...register('cooldownAfterBurst', { valueAsNumber: true })}
          min={0}
          max={600}
        />
        <p className="text-sm text-gray-600">
          連続投稿後の休止時間を設定します
        </p>
        {errors.cooldownAfterBurst && (
          <p className="text-sm text-red-600">{errors.cooldownAfterBurst.message}</p>
        )}
      </div>

      {/* 重複防止期間 */}
      <div className="space-y-2">
        <Label htmlFor="deduplication">重複防止期間（秒）</Label>
        <Input
          id="deduplication"
          type="number"
          {...register('deduplicationWindow', { valueAsNumber: true })}
          min={0}
          max={3600}
        />
        <p className="text-sm text-gray-600">
          同じ内容のコメントを防ぐ期間を設定します
        </p>
        {errors.deduplicationWindow && (
          <p className="text-sm text-red-600">{errors.deduplicationWindow.message}</p>
        )}
      </div>

      {/* 保存ボタン */}
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? '保存中...' : '保存'}
      </Button>
    </form>
  );
}
